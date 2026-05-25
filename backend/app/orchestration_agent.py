"""
Orchestration Agent: AWS Bedrock-powered agent that dynamically coordinates reconciliation workflow.

This agent uses Claude Sonnet 4.6 on AWS Bedrock with tool calling to intelligently decide:
- Which extraction method to use (Textract + Bedrock, Morpheus AI, etc.)
- When to fetch vendor history and learned patterns
- Which reconciliation strategy to apply (basic vs proactive with memory)
- How to handle edge cases (multi-currency, partial payments, adjustments)
- Whether to auto-approve or escalate to human review

The agent acts as a financial operations expert that makes contextual decisions rather than
following a fixed procedural workflow.
"""

import json
import uuid
from datetime import datetime
from typing import Any

import boto3

from app.core.config import settings


def _get_bedrock_client():
    """Initialize AWS Bedrock Runtime client."""
    return boto3.client(
        "bedrock-runtime",
        region_name="us-east-1",
        aws_access_key_id=settings.s3_access_key_id.get_secret_value()
        if settings.s3_access_key_id
        else None,
        aws_secret_access_key=settings.s3_secret_access_key.get_secret_value()
        if settings.s3_secret_access_key
        else None,
    )


# ═══════════════════════════════════════════════════════════════════════════════
# Tool Definitions for the Orchestration Agent
# ═══════════════════════════════════════════════════════════════════════════════

ORCHESTRATION_TOOLS = [
    {
        "name": "extract_document_data",
        "description": "Extract structured data from a payment document (image, PDF, or spreadsheet). Returns amount, currency, date, payer, payee, and description. Use this when you need to understand what's in an uploaded document.",
        "input_schema": {
            "type": "object",
            "properties": {
                "document_id": {
                    "type": "string",
                    "description": "UUID of the document to extract data from",
                },
                "file_type": {
                    "type": "string",
                    "enum": ["image", "pdf", "excel"],
                    "description": "Type of document (image, pdf, or excel/csv)",
                },
                "force_reextract": {
                    "type": "boolean",
                    "description": "If true, re-extract even if data already exists. Default false.",
                },
            },
            "required": ["document_id", "file_type"],
        },
    },
    {
        "name": "convert_currency",
        "description": "Convert an amount from one currency to another using historical exchange rates. Use this when dealing with foreign currency transactions that need to be normalized to the organization's base currency.",
        "input_schema": {
            "type": "object",
            "properties": {
                "amount": {
                    "type": "number",
                    "description": "Amount to convert",
                },
                "from_currency": {
                    "type": "string",
                    "description": "Source currency code (e.g., USD, EUR, SGD)",
                },
                "to_currency": {
                    "type": "string",
                    "description": "Target currency code (e.g., MYR)",
                },
                "date": {
                    "type": "string",
                    "description": "Date for exchange rate in YYYY-MM-DD format, or 'latest'",
                },
            },
            "required": ["amount", "from_currency", "to_currency"],
        },
    },
    {
        "name": "get_vendor_history",
        "description": "Retrieve historical transactions with a specific vendor over the last N months. Use this to understand payment patterns, typical amounts, late payment history, and vendor behavior for better matching.",
        "input_schema": {
            "type": "object",
            "properties": {
                "organization_id": {
                    "type": "string",
                    "description": "UUID of the organization",
                },
                "vendor_name": {
                    "type": "string",
                    "description": "Name of the vendor/payer/payee to look up",
                },
                "months_back": {
                    "type": "integer",
                    "description": "How many months of history to retrieve (default 3)",
                },
            },
            "required": ["organization_id", "vendor_name"],
        },
    },
    {
        "name": "get_learned_patterns",
        "description": "Retrieve AI-learned patterns for this organization, such as typical bank fee percentages, late payment patterns, and recurring transaction rules. Use this to make smarter reconciliation decisions based on organizational history.",
        "input_schema": {
            "type": "object",
            "properties": {
                "organization_id": {
                    "type": "string",
                    "description": "UUID of the organization",
                },
            },
            "required": ["organization_id"],
        },
    },
    {
        "name": "reconcile_basic",
        "description": "Perform basic fuzzy matching reconciliation between payment proof and bank statement entries. Use this for straightforward cases where you don't need historical context or agentic adjustments.",
        "input_schema": {
            "type": "object",
            "properties": {
                "proof_data": {
                    "type": "object",
                    "description": "Extracted payment proof data (amount, currency, date, payer, payee, description)",
                },
                "bank_entries": {
                    "type": "array",
                    "items": {"type": "object"},
                    "description": "List of bank statement entries to match against",
                },
                "fx_result": {
                    "type": "object",
                    "description": "Currency conversion result if applicable (optional)",
                },
            },
            "required": ["proof_data", "bank_entries"],
        },
    },
    {
        "name": "reconcile_proactive",
        "description": "Perform advanced reconciliation with memory, vendor history, learned patterns, and agentic adjustment proposals. Use this when you need intelligent decisions about bank fees, FX spreads, partial payments, or other discrepancies.",
        "input_schema": {
            "type": "object",
            "properties": {
                "proof_data": {
                    "type": "object",
                    "description": "Extracted payment proof data",
                },
                "bank_entries": {
                    "type": "array",
                    "items": {"type": "object"},
                    "description": "Bank statement entries",
                },
                "fx_result": {
                    "type": "object",
                    "description": "Currency conversion result (optional)",
                },
                "vendor_history": {
                    "type": "array",
                    "items": {"type": "object"},
                    "description": "Historical transactions with this vendor",
                },
                "learned_patterns": {
                    "type": "array",
                    "items": {"type": "object"},
                    "description": "Learned organizational patterns",
                },
                "vendor_preferences": {
                    "type": "array",
                    "items": {"type": "object"},
                    "description": "Vendor name variations and preferences",
                },
            },
            "required": ["proof_data", "bank_entries"],
        },
    },
    {
        "name": "calculate_risk_score",
        "description": "Calculate risk score and determine risk level for a reconciliation decision. Use this to determine if auto-approval is safe or if human review is needed.",
        "input_schema": {
            "type": "object",
            "properties": {
                "match_scores": {
                    "type": "array",
                    "items": {"type": "object"},
                    "description": "Fuzzy match scores from reconciliation",
                },
                "best_match": {
                    "type": "object",
                    "description": "The best match candidate details",
                },
            },
            "required": ["match_scores"],
        },
    },
    {
        "name": "final_decision",
        "description": "Make the final decision and return the orchestration result. Call this when you've completed your analysis and are ready to return the reconciliation decision to the user. This MUST be the last tool you call.",
        "input_schema": {
            "type": "object",
            "properties": {
                "status": {
                    "type": "string",
                    "enum": [
                        "matched",
                        "matched_with_adjustment",
                        "fuzzy",
                        "unmatched",
                        "error",
                    ],
                    "description": "Final reconciliation status",
                },
                "confidence": {
                    "type": "number",
                    "description": "Confidence score 0.0-1.0",
                },
                "explanation": {
                    "type": "string",
                    "description": "Detailed explanation of your decision-making process and reasoning",
                },
                "matched_entry_index": {
                    "type": "integer",
                    "description": "Index of matched bank entry, or null if unmatched",
                },
                "adjustment_type": {
                    "type": "string",
                    "description": "Type of adjustment if matched_with_adjustment (bank_fee, fx_spread, rounding, partial_payment)",
                },
                "adjustment_amount": {
                    "type": "number",
                    "description": "Amount of adjustment needed",
                },
                "journal_entry_proposal": {
                    "type": "object",
                    "description": "Proposed journal entry for adjustment",
                },
                "auto_approve": {
                    "type": "boolean",
                    "description": "Whether this should be auto-approved or needs human review",
                },
                "risk_level": {
                    "type": "string",
                    "enum": ["LOW", "MEDIUM", "HIGH"],
                    "description": "Risk level assessment",
                },
                "suggested_action": {
                    "type": "string",
                    "description": "Clear next steps for the user",
                },
            },
            "required": [
                "status",
                "confidence",
                "explanation",
                "auto_approve",
                "risk_level",
                "suggested_action",
            ],
        },
    },
]

ORCHESTRATION_SYSTEM_PROMPT = """You are an AI Orchestration Agent for treasury and financial reconciliation operations.

Your role is to intelligently coordinate the reconciliation workflow by deciding which tools to use, in what order, and how to interpret the results.

DECISION-MAKING FRAMEWORK:

1. ANALYZE THE CONTEXT
   - What information do you have about the document?
   - What's missing that you need to make a good decision?
   - Is this a simple case or complex case?

2. GATHER INFORMATION STRATEGICALLY
   - Extract document data if not available
   - For foreign currency: convert to base currency
   - For vendors you've seen before: fetch history and patterns
   - Consider when MORE data will help vs when you have ENOUGH

3. CHOOSE THE RIGHT RECONCILIATION STRATEGY
   - Basic reconciliation: Simple cases, straightforward matches
   - Proactive reconciliation: Complex cases, discrepancies, historical patterns matter

4. RISK ASSESSMENT
   - Calculate risk for auto-approval decisions
   - High confidence + low risk = auto-approve
   - Uncertainty or high risk = escalate to human

5. MAKE THE FINAL DECISION
   - Always call final_decision as your LAST tool call
   - Provide clear explanation of your reasoning
   - Be transparent about uncertainty

ORCHESTRATION PATTERNS:

Pattern A: Simple Same-Currency Transaction
1. extract_document_data (if needed)
2. reconcile_basic
3. calculate_risk_score
4. final_decision

Pattern B: Foreign Currency Transaction
1. extract_document_data (if needed)
2. convert_currency
3. get_vendor_history (if vendor name available)
4. reconcile_proactive (use history for better matching)
5. calculate_risk_score
6. final_decision

Pattern C: Complex Case with Discrepancy
1. extract_document_data
2. convert_currency (if needed)
3. get_vendor_history
4. get_learned_patterns
5. reconcile_proactive (with full context)
6. calculate_risk_score
7. final_decision (may propose adjustment)

Pattern D: Error Recovery
If any tool fails, explain the error in final_decision with status="error"

CRITICAL RULES:
- You MUST call final_decision exactly once as your last tool call
- If you're uncertain, be transparent - set lower confidence and escalate to human
- Historical context is valuable but not always necessary - use judgment
- Explain your reasoning in detail so humans can learn from your decisions
- Auto-approve only when confidence is high (>0.85) AND risk is low (<40)

Remember: You're not just executing a workflow - you're making intelligent decisions about financial data. Think like a financial operations expert."""


# ═══════════════════════════════════════════════════════════════════════════════
# Tool Execution Context
# ═══════════════════════════════════════════════════════════════════════════════


class OrchestrationContext:
    """Context object that holds state and executes tools for the orchestration agent."""

    def __init__(
        self,
        document_id: uuid.UUID,
        session,
        organization_id: uuid.UUID,
        base_currency: str,
        bank_entries: list[dict],
        extracted_data: dict | None = None,
    ):
        self.document_id = document_id
        self.session = session
        self.organization_id = organization_id
        self.base_currency = base_currency
        self.bank_entries = bank_entries
        self.extracted_data = extracted_data

        # Store intermediate results
        self.fx_result: dict | None = None
        self.vendor_history: list[dict] = []
        self.learned_patterns: list[dict] = []
        self.vendor_preferences: list[dict] = []
        self.reconciliation_result: dict | None = None
        self.risk_assessment: dict | None = None

    async def execute_tool(self, tool_name: str, tool_input: dict) -> dict:
        """Execute a tool and return the result."""
        try:
            if tool_name == "extract_document_data":
                return await self._extract_document_data(tool_input)
            elif tool_name == "convert_currency":
                return await self._convert_currency(tool_input)
            elif tool_name == "get_vendor_history":
                return await self._get_vendor_history(tool_input)
            elif tool_name == "get_learned_patterns":
                return await self._get_learned_patterns(tool_input)
            elif tool_name == "reconcile_basic":
                return await self._reconcile_basic(tool_input)
            elif tool_name == "reconcile_proactive":
                return await self._reconcile_proactive(tool_input)
            elif tool_name == "calculate_risk_score":
                return await self._calculate_risk_score(tool_input)
            elif tool_name == "final_decision":
                return await self._final_decision(tool_input)
            else:
                return {"error": f"Unknown tool: {tool_name}"}
        except Exception as e:
            return {"error": f"Tool execution failed: {str(e)}"}

    async def _extract_document_data(self, params: dict) -> dict:
        """Extract data from document."""
        # If we already have extracted data and not forcing re-extract, return it
        if self.extracted_data and not params.get("force_reextract"):
            return {
                "success": True,
                "data": self.extracted_data,
                "message": "Using previously extracted data",
            }

        from app.models import Document
        import boto3
        from app.extraction import extract_from_image, extract_from_pdf

        doc = self.session.get(Document, self.document_id)
        if not doc:
            return {"error": "Document not found"}

        if doc.extracted_data and not params.get("force_reextract"):
            self.extracted_data = doc.extracted_data
            return {"success": True, "data": doc.extracted_data}

        # Fetch from S3 and extract
        s3 = boto3.client(
            "s3",
            region_name=settings.s3_region,
            aws_access_key_id=settings.s3_access_key_id.get_secret_value()
            if settings.s3_access_key_id
            else None,
            aws_secret_access_key=settings.s3_secret_access_key.get_secret_value()
            if settings.s3_secret_access_key
            else None,
        )
        obj = s3.get_object(Bucket=settings.s3_bucket_name, Key=doc.s3_key)
        file_bytes = obj["Body"].read()

        file_type = params.get("file_type", doc.file_type)
        if file_type == "image":
            data = extract_from_image(file_bytes)
        elif file_type == "pdf":
            data = extract_from_pdf(file_bytes)
        else:
            return {"error": f"Unsupported file type: {file_type}"}

        self.extracted_data = data
        return {"success": True, "data": data}

    async def _convert_currency(self, params: dict) -> dict:
        """Convert currency using FX service."""
        from app.fx import convert

        result = await convert(
            amount=params["amount"],
            from_currency=params["from_currency"],
            to_currency=params["to_currency"],
            on_date=params.get("date", "latest"),
        )
        self.fx_result = result
        return {"success": True, "conversion": result}

    async def _get_vendor_history(self, params: dict) -> dict:
        """Fetch vendor transaction history."""
        from app.proactive_reconciliation import get_vendor_history

        history = await get_vendor_history(
            session=self.session,
            organization_id=uuid.UUID(params["organization_id"]),
            vendor_name=params["vendor_name"],
            months_back=params.get("months_back", 3),
        )
        self.vendor_history = history
        return {"success": True, "history": history, "count": len(history)}

    async def _get_learned_patterns(self, params: dict) -> dict:
        """Fetch learned patterns for organization."""
        from app.ai_learning import get_learned_patterns, get_learned_vendor_preferences

        patterns_objs = await get_learned_patterns(
            self.session, uuid.UUID(params["organization_id"])
        )
        patterns = [
            {
                "pattern_type": p.pattern_type,
                "pattern_name": p.pattern_name,
                "pattern_rule": p.pattern_rule,
                "learned_from_count": p.learned_from_count,
                "success_rate": p.success_rate,
            }
            for p in patterns_objs
        ]

        vendor_prefs_objs = await get_learned_vendor_preferences(
            self.session, uuid.UUID(params["organization_id"])
        )
        vendor_prefs = [
            {
                "canonical_vendor_name": vp.canonical_vendor_name,
                "vendor_aliases": vp.vendor_aliases,
                "typical_amount_range": vp.typical_amount_range,
                "is_recurring": vp.is_recurring,
                "confidence": vp.confidence,
            }
            for vp in vendor_prefs_objs
        ]

        self.learned_patterns = patterns
        self.vendor_preferences = vendor_prefs
        return {
            "success": True,
            "patterns": patterns,
            "vendor_preferences": vendor_prefs,
        }

    async def _reconcile_basic(self, params: dict) -> dict:
        """Perform basic reconciliation."""
        from app.reconciliation import reconcile

        result = await reconcile(
            proof=params["proof_data"],
            bank_entries=params["bank_entries"],
            fx_result=params.get("fx_result"),
        )
        self.reconciliation_result = result
        return {"success": True, "result": result}

    async def _reconcile_proactive(self, params: dict) -> dict:
        """Perform proactive reconciliation with memory."""
        from app.reconciliation import _compute_match_score
        from app.proactive_reconciliation import reconcile_with_memory

        # Compute match scores for context
        proof = params["proof_data"]
        bank_entries = params["bank_entries"]
        fx_result = params.get("fx_result")
        myr_amount = fx_result["to_amount"] if fx_result else proof.get("amount")

        match_scores = [
            _compute_match_score(proof, entry, myr_amount) for entry in bank_entries
        ]

        result = await reconcile_with_memory(
            proof=proof,
            bank_entries=bank_entries,
            fx_result=fx_result,
            vendor_history=params.get("vendor_history", []),
            learned_patterns=params.get("learned_patterns", []),
            vendor_preferences=params.get("vendor_preferences", []),
            match_scores=match_scores,
        )
        self.reconciliation_result = result
        return {"success": True, "result": result}

    async def _calculate_risk_score(self, params: dict) -> dict:
        """Calculate risk score."""
        from app.risk import calculate_risk_score

        risk_score, risk_factors = calculate_risk_score(
            params["match_scores"], params.get("best_match")
        )

        if risk_score >= 70:
            risk_level = "HIGH"
        elif risk_score >= 40:
            risk_level = "MEDIUM"
        else:
            risk_level = "LOW"

        self.risk_assessment = {
            "risk_score": risk_score,
            "risk_level": risk_level,
            "risk_factors": risk_factors,
        }
        return {"success": True, "risk_score": risk_score, "risk_level": risk_level, "risk_factors": risk_factors}

    async def _final_decision(self, params: dict) -> dict:
        """Record final decision - this ends the orchestration loop."""
        return {
            "success": True,
            "final_decision": params,
            "is_final": True,  # Signal to stop orchestration loop
        }


# ═══════════════════════════════════════════════════════════════════════════════
# Main Orchestration Loop
# ═══════════════════════════════════════════════════════════════════════════════


async def orchestrate_reconciliation(
    document_id: uuid.UUID,
    session,
    organization_id: uuid.UUID,
    base_currency: str,
    bank_entries: list[dict],
    extracted_data: dict | None = None,
    max_iterations: int = 15,
) -> dict:
    """
    Run the orchestration agent to reconcile a document against bank statements.

    The agent will dynamically decide which tools to use and in what order,
    then make a final reconciliation decision.

    Args:
        document_id: UUID of the document to reconcile
        session: Database session
        organization_id: Organization UUID
        base_currency: Organization's base currency (e.g., "MYR")
        bank_entries: List of bank statement entries to match against
        extracted_data: Pre-extracted document data (optional)
        max_iterations: Maximum tool calls to prevent infinite loops

    Returns:
        Orchestration result with final decision and full context
    """
    context = OrchestrationContext(
        document_id=document_id,
        session=session,
        organization_id=organization_id,
        base_currency=base_currency,
        bank_entries=bank_entries,
        extracted_data=extracted_data,
    )

    client = _get_bedrock_client()

    # Build initial prompt
    user_prompt = f"""Reconcile this payment document against the bank statement entries.

CONTEXT:
- Document ID: {document_id}
- Organization base currency: {base_currency}
- Number of bank entries to match against: {len(bank_entries)}
"""

    if extracted_data:
        user_prompt += f"\nPRE-EXTRACTED DATA:\n{json.dumps(extracted_data, indent=2)}\n"
    else:
        user_prompt += "\nDocument data has NOT been extracted yet. You'll need to extract it first.\n"

    user_prompt += f"\nBANK ENTRIES:\n{json.dumps(bank_entries[:5], indent=2)}"
    if len(bank_entries) > 5:
        user_prompt += f"\n... and {len(bank_entries) - 5} more entries"

    user_prompt += """

Analyze this case and use your tools to gather information and make a reconciliation decision.
Remember to call final_decision as your LAST tool call with your complete analysis and recommendation."""

    messages = [{"role": "user", "content": user_prompt}]

    iteration = 0
    final_result = None

    while iteration < max_iterations:
        iteration += 1

        # Call Bedrock with tools
        request_body = {
            "anthropic_version": "bedrock-2023-05-31",
            "max_tokens": 4096,
            "system": ORCHESTRATION_SYSTEM_PROMPT,
            "messages": messages,
            "tools": ORCHESTRATION_TOOLS,
            "temperature": 0.1,
        }

        response = client.invoke_model(
            modelId="us.anthropic.claude-sonnet-4-6",
            body=json.dumps(request_body),
        )

        response_body = json.loads(response["body"].read())

        # Check for errors
        if "error" in response_body:
            return {
                "success": False,
                "error": response_body["error"],
                "iterations": iteration,
            }

        # Parse response
        assistant_message = {
            "role": "assistant",
            "content": response_body.get("content", []),
        }
        messages.append(assistant_message)

        stop_reason = response_body.get("stop_reason")

        # Check if agent wants to use tools
        if stop_reason == "tool_use":
            # Execute tools
            tool_results = []

            for content_block in response_body.get("content", []):
                if content_block.get("type") == "tool_use":
                    tool_name = content_block.get("name")
                    tool_input = content_block.get("input", {})
                    tool_use_id = content_block.get("id")

                    # Execute the tool
                    tool_result = await context.execute_tool(tool_name, tool_input)

                    tool_results.append(
                        {
                            "type": "tool_result",
                            "tool_use_id": tool_use_id,
                            "content": json.dumps(tool_result),
                        }
                    )

                    # Check if this was the final_decision tool
                    if tool_name == "final_decision" and tool_result.get("is_final"):
                        final_result = tool_result["final_decision"]
                        break

            # If we got final decision, stop
            if final_result:
                break

            # Add tool results to conversation
            messages.append({"role": "user", "content": tool_results})

        elif stop_reason == "end_turn":
            # Agent finished without calling final_decision - this is an error
            return {
                "success": False,
                "error": "Agent did not call final_decision tool",
                "iterations": iteration,
                "messages": messages,
            }
        else:
            # Unexpected stop reason
            return {
                "success": False,
                "error": f"Unexpected stop reason: {stop_reason}",
                "iterations": iteration,
            }

    # If we hit max iterations without final decision
    if not final_result:
        return {
            "success": False,
            "error": f"Max iterations ({max_iterations}) reached without final decision",
            "iterations": iteration,
        }

    # Build complete result
    return {
        "success": True,
        "final_decision": final_result,
        "context": {
            "extracted_data": context.extracted_data,
            "fx_result": context.fx_result,
            "vendor_history": context.vendor_history,
            "learned_patterns": context.learned_patterns,
            "vendor_preferences": context.vendor_preferences,
            "reconciliation_result": context.reconciliation_result,
            "risk_assessment": context.risk_assessment,
        },
        "iterations": iteration,
        "bank_entries": bank_entries,
    }
