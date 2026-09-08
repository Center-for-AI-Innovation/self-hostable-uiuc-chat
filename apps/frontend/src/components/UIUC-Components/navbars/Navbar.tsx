import {
  IconClipboardText,
  IconFilePlus,
  IconHome,
  IconMenu2,
  IconSparkles,
  IconX,
} from '@tabler/icons-react'
import { montserrat_heading } from 'fonts'
import { Button } from '@/components/shadcn/ui/button'
import Image from 'next/image'
import Link from 'next/link'
import { useRouter } from 'next/router'
import { useEffect, useState } from 'react'
import GlobalHeader from '~/components/UIUC-Components/navbars/GlobalHeader'

interface NavbarProps {
  course_name?: string
  bannerUrl?: string
  isPlain?: boolean
}

interface NavItem {
  name: React.ReactNode
  icon: React.ReactElement
  link: string
}

interface NavigationContentProps {
  items: NavItem[]
  opened: boolean
  activeLink: string
  onLinkClick: () => void
  onToggle: () => void
  courseName: string
}

// Shared nav-link classes (formerly the Mantine `link` createStyles entry).
// Mantine tokens resolved: spacing.xs=10px, spacing.sm=12px, spacing.lg=20px, radius.sm=4px.
// All colors remain the existing --navbar-* CSS variables. See docs/mantine-retirement-styles-notes.md.
const navLinkClass =
  'flex items-center justify-center gap-[0.4rem] rounded px-3 py-2.5 text-[13px] font-bold text-[--navbar-foreground] transition-colors hover:bg-[--navbar-hover-background] hover:text-[--navbar-hover] hover:no-underline data-[active=true]:bg-[--navbar-background] data-[active=true]:text-[--navbar-active] data-[active=true]:no-underline max-md:justify-start max-md:rounded-none max-md:bg-[--navbar-background] max-md:px-3 max-md:py-5'

const styles = {
  logoContainerBox: {
    justifyContent: 'center',
    alignItems: 'center',
    overflow: 'hidden',
    position: 'relative',
    height: '100%',
    maxWidth:
      typeof window !== 'undefined' && window.innerWidth > 600 ? '80%' : '100%',
    paddingRight:
      typeof window !== 'undefined' && window.innerWidth > 600 ? '4px' : '25px',
    paddingLeft: '25px',
  },
  thumbnailImage: {
    objectFit: 'cover',
    objectPosition: 'center',
    height: '100%',
    width: 'auto',
  },
} as const

function Logo() {
  return (
    <div className="flex-1">
      <Link href="/" tabIndex={0} aria-label="Home Page">
        <div
          className={`ms-4 flex items-center gap-0 font-bold ${montserrat_heading.variable} font-montserratHeading`}
        >
          <div style={{ width: '2.5rem', height: '2.5rem' }}>
            <img
              src="/media/logo_illinois.png"
              width="auto"
              height="100%"
              alt="Illinois Logo"
            />
          </div>

          <div className="text-2xl font-extrabold tracking-tight text-[--illinois-orange-branding] sm:ml-2 sm:text-[1.8rem]">
            Illinois <span className="text-[--foreground]">Chat</span>
          </div>
        </div>
      </Link>
    </div>
  )
}

function BannerImage({
  url,
  courseName,
}: {
  url: string
  courseName?: string
}) {
  const altText = courseName ? `${courseName} logo` : 'Course chatbot logo'
  return (
    <div style={styles.logoContainerBox}>
      <Image
        src={url}
        style={styles.thumbnailImage}
        width={2000}
        height={2000}
        alt={altText}
        aria-label={altText}
        onError={(e) => (e.currentTarget.style.display = 'none')}
      />
    </div>
  )
}

function NavText({ children }: { children: React.ReactNode }) {
  return (
    <span className={`${montserrat_heading.variable} font-montserratHeading`}>
      {children}
    </span>
  )
}

function getCurrentPageName(link: string, items: NavItem[]) {
  const found: any = items.filter(
    (item: NavItem) => item.link && link == item.link,
  )

  return found.length > 0 ? found.shift().name : ''
}

function NavigationContent({
  items,
  opened,
  activeLink,
  onLinkClick,
  onToggle,
}: NavigationContentProps) {
  return (
    <>
      {/* Mobile dropdown (was Mantine <Transition pop-top-right> + <Paper>) */}
      {opened && (
        <nav
          aria-label="Mobile navigation"
          className="absolute right-2 top-16 z-[2] w-[calc(100%-1rem)] max-w-[330px] origin-top-right overflow-visible rounded-[10px] border border-[--navbar-border] bg-[--background-faded] shadow-lg duration-200 animate-in fade-in-0 zoom-in-95 lg:hidden"
        >
          {items.map((item, index) => (
            <Link
              tabIndex={0}
              key={index}
              href={item.link}
              onClick={() => onLinkClick()}
              data-active={activeLink === item.link}
              className={navLinkClass}
            >
              {item.icon}
              {item.name}
            </Link>
          ))}
        </nav>
      )}

      <nav
        className="flex items-start justify-between"
        style={{ paddingLeft: '0px' }}
        aria-label="Main navigation"
      >
        <div className="hidden flex-row justify-between md:flex">
          {items.map((item, index) => (
            <Link
              tabIndex={0}
              key={index}
              href={item.link}
              onClick={() => onLinkClick()}
              data-active={activeLink === item.link}
              className={navLinkClass}
            >
              {item.icon}
              {item.name}
            </Link>
          ))}
        </div>
      </nav>

      <Button
        type="button"
        variant="ghost"
        size="icon-sm"
        tabIndex={0}
        aria-label="Toggle Menu"
        aria-expanded={opened}
        onClick={onToggle}
        className="p-1 text-[--foreground] md:hidden [&_svg]:size-5"
      >
        {opened ? (
          <IconX size={20} aria-hidden="true" />
        ) : (
          <IconMenu2 size={20} aria-hidden="true" />
        )}
      </Button>
    </>
  )
}

// Icon Components
export function DashboardIcon() {
  return <IconHome size={20} strokeWidth={2} aria-hidden="true" />
}

export function FileIcon() {
  return (
    <IconFilePlus
      color="var(--foreground)"
      size={20}
      strokeWidth={2}
      aria-hidden="true"
      style={{ margin: '0' }}
    />
  )
}

export function ClipboardIcon() {
  return (
    <IconClipboardText
      color="var(--foreground)"
      size={20}
      strokeWidth={2}
      aria-hidden="true"
      style={{ margin: '0' }}
    />
  )
}

export default function Navbar({
  course_name = '',
  bannerUrl = '',
  isPlain = false,
}: NavbarProps) {
  const [opened, setOpened] = useState(false)
  const toggle = () => setOpened((o) => !o)
  const close = () => setOpened(false)
  const router = useRouter()
  const [activeLink, setActiveLink] = useState<string>('')

  useEffect(() => {
    if (!router.isReady) return
    const path = router.asPath.split('?')[0]
    if (path) setActiveLink(path)
  }, [router.asPath, router.isReady])

  const navItems: NavItem[] = [
    {
      name: <NavText>My Chatbots</NavText>,
      icon: <DashboardIcon />,
      link: '/chatbots', // Add conditional course_name ? `/${course_name}/dashboard` :
    },
    {
      name: <NavText>Create Your Own Bot</NavText>,
      icon: <IconSparkles aria-hidden="true" />,
      link: '/new',
    },
  ]

  return (
    <div className="fixed left-0 right-0 top-0 z-[50] bg-[--navbar-background]">
      {/* TODO: determine z-index values for major elements (nav, modals, tooltips, etc). for now, changed z-[999] to z-[50] to avoid modals being under the top navigation */}
      {/***************** top navigation for all pages *****************/}

      <div className="flex flex-row items-center justify-center">
        <header className="navbar h-20 w-full border-b border-[--navbar-border] bg-[--navbar-background]">
          <Logo />

          {!isPlain && (
            <NavigationContent
              items={navItems}
              opened={opened}
              activeLink={activeLink}
              onLinkClick={close}
              onToggle={toggle}
              courseName={course_name}
            />
          )}

          <div className="flex items-center">
            <div className="hidden items-center md:flex">
              <GlobalHeader isNavbar={true} />
            </div>
          </div>
        </header>
      </div>
    </div>
  )
}
