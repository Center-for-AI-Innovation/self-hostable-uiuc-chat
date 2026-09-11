import React from 'react'
import Link from 'next/link'
import { montserrat_heading } from 'fonts'

export const CannotEditGPT4Page = ({
  course_name,
}: {
  course_name: string
}) => {
  return (
    <>
      <main
        id="main-content"
        tabIndex={-1}
        className="justify-center; course-page-main flex min-h-screen flex-col items-center"
      >
        <div className="container flex flex-col items-center justify-center gap-8 px-4 py-8">
          <Link href="/">
            <h1 className="text-5xl font-extrabold tracking-tight text-white sm:text-[5rem]">
              {' '}
              UIUC.{' '}
              <span className="${inter.style.fontFamily} text-[hsl(280,100%,70%)]">
                chat
              </span>{' '}
            </h1>
          </Link>
        </div>
        <div className="items-left container flex flex-col justify-center gap-2 py-0">
          <div className="flex flex-col items-center justify-center">
            <h2
              className={`heading-h2 ${montserrat_heading.variable} font-montserratHeading bg-[linear-gradient(50deg,gold,white)] bg-clip-text p-8 text-transparent`}
            >
              {' '}
              You cannot edit the gpt4 page.
              <br></br>
              It&apos;s for using GPT-4 by itself with no extra knowledge base.
            </h2>

            <h3
              className={`heading-h3 ${montserrat_heading.variable} font-montserratHeading bg-[linear-gradient(50deg,gold,white)] bg-clip-text p-8 text-transparent`}
            >
              {' '}
              Go to{' '}
              <Link href={'/new'} className="goldUnderline">
                uiuc.chat/new
              </Link>{' '}
              to make a new page.
            </h3>
          </div>
        </div>
      </main>
    </>
  )
}
