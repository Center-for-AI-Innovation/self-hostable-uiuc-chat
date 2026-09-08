import { MainPageBackground } from '~/components/UIUC-Components/MainPageBackground'
import { Title, Text, Group, Badge } from '@mantine/core'

import { montserrat_heading, montserrat_paragraph } from 'fonts'
import { IconSunset2 } from '@tabler/icons-react'
import { showToast } from '~/utils/toastUtils'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/router'

export default function Unsubscribe() {
  const [email, setEmail] = useState('')
  const router = useRouter()

  useEffect(() => {
    if (router.isReady) {
      const emailParam = router.query.email
      if (typeof emailParam === 'string') setEmail(emailParam)
    }
  }, [router.isReady, router.query])

  const handleSubmit = async (event: any) => {
    if (!email) {
      showToast({
        title: 'No email identified. 🤔',
        message: 'Looked like the box was empty 👀',
        type: 'error',
        autoClose: 20000,
      })
      return
    }

    try {
      const response = await fetch('/api/UIUC-api/newsletterUnsubscribe', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ email }),
      })

      if (!response.ok) {
        showToast({
          title: 'Our database is having a bad day. 😢',
          message:
            "Seems like we couldn't unsubscribe you. Please try again later. Email help@uiuc.chat for assistance.",
          type: 'error',
          autoClose: 20000,
        })
        return
      }

      showToast({
        title: 'Successfully unsubscribed.',
        message:
          "See ya, wouldn't wanna be ya! 🌅 Redirecting to home page in 5 seconds...",
        type: 'success',
        autoClose: 5000,
        icon: <IconSunset2 size={16} />,
      })

      setTimeout(() => {
        router.push('/')
      }, 5000)
    } catch (error) {
      console.error('There was a problem with the fetch operation:', error)
      showToast({
        title: 'Our database is having a bad day. 😢',
        message: `Seems like we couldn't unsubscribe you. Please try again later. Email help@uiuc.chat for assistance. Full error: ${error}`,
        type: 'error',
        autoClose: 20000,
      })
    }
  }

  return (
    <MainPageBackground>
      <div className="w-full max-w-md space-y-6 rounded-lg bg-[#15162c] p-8 shadow-lg">
        <div className="space-y-2 text-center">
          <Title
            size="h3"
            className={`label ${montserrat_heading.className} inline-block select-text p-0 text-neutral-200`}
          >
            Unsubscribe <span style={{ fontSize: '22px' }}>🎉</span>
          </Title>
        </div>
        <Text
          size="md"
          className={`label ${montserrat_paragraph.className} inline-block select-text p-0 text-neutral-200`}
        >
          Unsubscribe from the UIUC.chat email newsletter.
        </Text>
        <Text
          size="sm"
          className={`label ${montserrat_paragraph.className}select-text p-0 text-neutral-200`}
        >
          I guess your inbox just got a little bit cleaner, but less exciting
          😒{' '}
        </Text>
        <Group>
          <Text
            size="md"
            className={`label ${montserrat_paragraph.className}select-text p-0 text-neutral-200`}
          >
            Email:
          </Text>
          <Badge size="lg" color="var(--link)" radius="md">
            {email}
          </Badge>
        </Group>

        <div>
          <button
            className="flex w-full justify-center rounded-md border border-transparent bg-[--button] px-4 py-2 text-sm font-medium text-[--button-text-color] hover:bg-[--button-hover] hover:text-[--button-hover-text-color] focus:outline-none focus:ring-2"
            onClick={handleSubmit}
          >
            Unsubscribe
          </button>
        </div>
      </div>
    </MainPageBackground>
  )
}
