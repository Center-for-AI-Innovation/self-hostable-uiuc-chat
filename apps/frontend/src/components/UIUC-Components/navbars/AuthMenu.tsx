import { useAuth } from 'react-oidc-context'
import { montserrat_heading } from 'fonts'
import { Avatar, AvatarFallback } from '@/components/shadcn/ui/avatar'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/shadcn/ui/dropdown-menu'
import { getKeycloakBaseUrl, initiateSignIn } from '~/utils/authHelpers'

const getInitials = (name: string) => {
  const names = name.split(' ')
  if (names.length >= 2) {
    return `${names[0]?.[0] || ''}${names[names.length - 1]?.[0] || ''}`.toUpperCase()
  }
  return (names[0]?.[0] || '').toUpperCase()
}

interface AuthMenuProps {
  size?: number
}

export const AuthMenu = ({ size = 34 }: AuthMenuProps) => {
  const auth = useAuth()

  if (auth.isAuthenticated) {
    return (
      <DropdownMenu>
        {/* Gradient avatar with a diagonal "shine" that sweeps across on hover.
            Shine + lift reproduced from the former Mantine createStyles ::after. */}
        <DropdownMenuTrigger
          nativeButton={false}
          render={
            <Avatar
              aria-label="User Menu"
              style={{ width: size, height: size }}
              className="relative cursor-pointer overflow-hidden border-2 border-[--border] transition-all duration-200 after:absolute after:inset-0 after:-translate-x-full after:bg-[linear-gradient(120deg,transparent_0%,transparent_30%,rgba(255,255,255,0.2)_50%,transparent_70%,transparent_100%)] after:content-[''] after:[transition:transform_650ms] hover:-translate-y-px hover:shadow-[0_4px_12px_rgba(0,0,0,0.15)] hover:after:translate-x-full"
            >
              <AvatarFallback className="bg-[linear-gradient(135deg,var(--illinois-industrial),var(--illinois-blue))] text-sm font-medium text-white">
                {getInitials(auth.user?.profile.name || '')}
              </AvatarFallback>
            </Avatar>
          }
        />

        <DropdownMenuContent
          align="end"
          sideOffset={5}
          className="rounded-xl border border-[--border] bg-[--background] p-1.5 shadow-[0_8px_24px_rgba(0,0,0,0.2)]"
        >
          <DropdownMenuItem
            className="my-0.5 cursor-pointer rounded-lg px-4 py-2.5 text-sm font-medium text-[--foreground] focus:bg-[--muted]"
            onClick={() => {
              // Fixed URL construction to avoid realm duplication
              window.open(
                `${getKeycloakBaseUrl()}realms/${process.env.NEXT_PUBLIC_KEYCLOAK_REALM}/account`,
                '_blank',
              )
            }}
          >
            Manage Account
          </DropdownMenuItem>
          <DropdownMenuItem
            className="my-0.5 cursor-pointer rounded-lg px-4 py-2.5 text-sm font-medium text-[--foreground] focus:bg-[--muted]"
            onClick={() => auth.signoutRedirect()}
          >
            Sign Out
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    )
  }

  return (
    <button
      tabIndex={0}
      className="login-btn flex h-[2.2rem] min-w-[100px] cursor-pointer items-center justify-center rounded-md border border-[--illinois-orange] bg-transparent px-3 text-sm font-bold text-[--illinois-orange] transition-colors duration-100 hover:bg-[rgb(255_95_5_/_0.05)]"
      onClick={() => void initiateSignIn(auth, window.location.pathname)}
    >
      <div
        className={`${montserrat_heading.variable} font-montserratHeading`}
        style={{ fontSize: '14px' }}
      >
        Sign in
      </div>
    </button>
  )
}
