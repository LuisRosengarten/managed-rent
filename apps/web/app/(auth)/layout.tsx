import { Building2 } from "lucide-react"

export default function AuthLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <div className="flex min-h-svh">
      {/* Left panel — branding */}
      <div className="relative hidden w-1/2 flex-col justify-between bg-primary p-10 text-primary-foreground lg:flex">
        <div className="flex items-center gap-2 text-lg font-semibold">
          <Building2 className="size-6" />
          managed-rent
        </div>
        <div>
          <blockquote className="text-lg font-medium leading-relaxed">
            &ldquo;Deine Wohnungssuche, intelligent organisiert.&rdquo;
          </blockquote>
          <p className="mt-2 text-sm opacity-80">
            Mails erkennen, Bewerbungen verwalten, Überblick behalten.
          </p>
        </div>
        <div className="text-xs opacity-60">
          managed-rent &copy; {new Date().getFullYear()}
        </div>
      </div>

      {/* Right panel — form */}
      <div className="flex flex-1 items-center justify-center p-6">
        <div className="w-full max-w-sm">{children}</div>
      </div>
    </div>
  )
}
