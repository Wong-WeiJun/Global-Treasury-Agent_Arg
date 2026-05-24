import { FaGithub, FaInstagram } from "react-icons/fa"

const socialLinks = [
  {
    icon: FaGithub,
    href: "https://github.com/Wong-WeiJun/Global-Treasury-Agent_Arg",
    label: "GitHub",
  },
  {
    icon: FaInstagram,
    href: "https://www.instagram.com/orhgee?igsh=N2ZhM20xcGYxY3ps",
    label: "Insta",
  },
]

export function Footer() {
  return (
    <footer className="border-t border-blue-900 bg-blue-950 dark:bg-blue-950 py-4 px-6">
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
