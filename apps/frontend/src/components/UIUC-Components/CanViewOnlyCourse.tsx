import Link from 'next/link'
import GlobalHeader from './navbars/GlobalHeader'
import { type CourseMetadata } from '~/types/courseMetadata'
import React from 'react'
import { useRouter } from 'next/router'
import GlobalFooter from './GlobalFooter'
import { montserrat_heading } from 'fonts'

export const GetCurrentPageName = () => {
  // /CS-125/dashboard --> CS-125
  return useRouter().asPath.slice(1).split('/')[0] as string
}

export const CanViewOnlyCourse = ({
  course_name,
  course_metadata,
}: {
  course_name: string
  course_metadata: CourseMetadata
}) => {
  // const { isSignedIn, user } = useUser()
  // const curr_user_email = user?.primaryEmailAddress?.emailAddress as string
  const router = useRouter()

  const getCurrentPageName = () => {
    // /CS-125/dashboard --> CS-125
    return router.asPath.slice(1).split('/')[0]
  }

  if (course_metadata == null || course_name == null) {
    // if you refresh the not_authorized page
    router.push(`${getCurrentPageName}/dashboard`)
  }

  return (
    <>
      <GlobalHeader />
      <main
        id="main-content"
        tabIndex={-1}
        className="justify-center; course-page-main flex min-h-screen flex-col items-center"
      >
        <div className="container flex flex-col items-center justify-center gap-8 px-4 py-8">
          <Link href="/">
            <h1 className="text-5xl font-extrabold tracking-tight text-white sm:text-[5rem]">
              {' '}
              UIUC.
              <span className="${inter.style.fontFamily} text-[hsl(280,100%,70%)]">
                chat
              </span>{' '}
            </h1>
          </Link>
        </div>
        <div className="items-left container flex flex-col justify-center gap-2 py-0">
          <div className="flex flex-col items-center justify-center">
            <div
              style={{
                display: 'inline-block',
                border: '1px solid gold',
                borderRadius: '4px',
                padding: '1rem',
              }}
            >
              <h2
                className={`heading-h2 ${montserrat_heading.variable} font-montserratHeading bg-[linear-gradient(50deg,gold,white)] bg-clip-text p-8 text-transparent`}
              >
                {' '}
                You cannot edit this page, but you <i>can</i> chat here:{' '}
                <Link href={`/${course_name}/chat`}>
                  <u
                    style={{
                      textDecoration: 'underline',
                      textDecorationColor: 'gold',
                      color: 'inherit',
                    }}
                  >
                    uiuc.chat/{course_name}
                  </u>
                </Link>
              </h2>
            </div>

            <div className="flex flex-col items-center justify-center">
              {/* SHOW CREATOR AND ADMINS */}
              <h3
                className={`heading-h3 ${montserrat_heading.variable} font-montserratHeading bg-[linear-gradient(50deg,gold,white)] bg-clip-text p-5 text-transparent`}
              >
                For Admin permissions to edit the content, email the creator or
                admins to request access:
              </h3>
              <>
                <p
                  className={`${montserrat_heading.variable} font-montserratHeading bg-[linear-gradient(50deg,gold,white)] bg-clip-text pt-[2px] pb-[10px] text-[20px] text-transparent`}
                >
                  Creator:{' '}
                  <a href={`mailto:${course_metadata['course_owner']}`}>
                    <u
                      style={{
                        textDecoration: 'underline',
                        textDecorationColor: 'gold',
                        color: 'inherit',
                      }}
                    >
                      {course_metadata['course_owner']}
                    </u>
                  </a>
                  {course_metadata['course_admins'].length > 0 && (
                    <>
                      <br></br>
                      Admins:{' '}
                      <a
                        href={`mailto:${course_metadata['course_admins'].join(
                          ', ',
                        )}`}
                      >
                        <u
                          style={{
                            textDecoration: 'underline',
                            textDecorationColor: 'gold',
                            color: 'inherit',
                          }}
                        >
                          {course_metadata['course_admins'].join(', ')}
                        </u>
                      </a>
                    </>
                  )}
                </p>
              </>
            </div>

            <h3
              className={`heading-h3 ${montserrat_heading.variable} font-montserratHeading bg-[linear-gradient(50deg,gold,white)] bg-clip-text p-8 py-[35px] text-transparent`}
            >
              {' '}
              If <i>you are</i> the creator or an admin, please sign in with the
              account you used to create this page (in the top right).
              <br></br>
              <br></br>
              Or go to{' '}
              <Link href={'/new'} className="goldUnderline">
                uiuc.chat/new
              </Link>{' '}
              to make a new page.
            </h3>
          </div>
        </div>
      </main>

      <GlobalFooter />
    </>
  )
}
