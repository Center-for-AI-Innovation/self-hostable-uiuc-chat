import React from 'react'
import Link from 'next/link'
import { montserrat_heading } from 'fonts'

export const CannotEditCourse = ({ course_name }: { course_name: string }) => {
  return (
    <>
      <div className="flex flex-col items-center justify-center">
        <h2
          className={`heading-h2 ${montserrat_heading.variable} font-montserratHeading bg-[linear-gradient(50deg,gold,white)] bg-clip-text p-8 text-transparent`}
        >
          {' '}
          You cannot edit this page because you don&apos;t own it.
          <br></br>
          {/* It&apos;s for using GPT-4 by itself with no extra knowledge base. */}
        </h2>

        <h3
          className={`heading-h3 ${montserrat_heading.variable} font-montserratHeading bg-[linear-gradient(50deg,gold,white)] bg-clip-text p-8 text-transparent`}
        >
          {' '}
          Either sign in with a different account (in the top right) or
          <br></br>
          Go to{' '}
          <Link href={'/new'} className="goldUnderline">
            uiuc.chat/new
          </Link>{' '}
          to make a new page.
        </h3>
      </div>
    </>
  )
}
