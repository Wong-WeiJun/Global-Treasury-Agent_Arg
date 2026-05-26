import { FaGithub } from "react-icons/fa"

const socialLinks = [
  {
    icon: FaGithub,
    href: "https://github.com/Wong-WeiJun/Global-Treasury-Agent_Arg",
    label: "GitHub",
  },
]

interface FooterProps {
  transparent?: boolean
}

export function Footer({ transparent }: FooterProps) {
  return (
    <footer
      className={
        transparent
          ? "py-4 px-6 bg-transparent border-transparent"
          : "border-t border-blue-900 bg-blue-950 dark:bg-blue-950 py-4 px-6"
      }
    >
      <div className="flex flex-col items-center justify-between gap-4 sm:flex-row">
        <p className="text-blue-200 text-sm">
          MyAudit - The Global Treasury Agent
        </p>
        <div className="flex items-center gap-4">
          {socialLinks.map(({ icon: Icon, href, label }) => (
            <a
              key={label}
              href={href}
              target="_blank"
              rel="noopener noreferrer"
              aria-label={label}
              className="text-blue-200 hover:text-white transition-colors"
            >
              <Icon className="h-5 w-5" />
            </a>
          ))}
        </div>
      </div>
    </footer>
  )
}
