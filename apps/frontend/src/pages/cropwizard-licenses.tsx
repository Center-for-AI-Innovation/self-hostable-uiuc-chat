import { type NextPage } from 'next'
import Link from 'next/link'
import { montserrat_heading } from 'fonts'
import { MainPageBackground } from '../components/UIUC-Components/MainPageBackground'
import GlobalFooter from '../components/UIUC-Components/GlobalFooter'

const CropwizardLicenses: NextPage = () => {
  return (
    <>
      <MainPageBackground>
        {/* was Mantine <Title order={2}>. The app's MantineProvider theme overrides
            h2 to fontSize 2.2rem + headings.fontFamily 'Montserrat' (weight 700, lh 1.35),
            NOT Mantine's 1.625rem default. Matches chat.illinois.edu exactly. */}
        <h2
          className={`${montserrat_heading.variable} font-montserratHeading text-[2.2rem] font-bold leading-[1.35]`}
        >
          CropWizard Document Licenses
        </h2>
        <div className="flex min-h-[50px] flex-col flex-wrap items-start justify-start gap-4">
          <p className="max-w-[600px]">
            The documents in CropWizard are collected from many different
            sources, and each document is subject to its respective license,
            including the following. Any downstream use of CropWizard&apos;s
            results must respect the license of the documents that were used.
          </p>
          <ul className="list-disc pl-10">
            <li>
              <Link
                href="https://creativecommons.org/licenses/by/4.0/"
                className="hover:[--dashboard-button-hover] text-[--dashboard-button] active:text-[--dashboard-button]"
                style={{ transition: 'color 0.2s' }}
              >
                CC BY
              </Link>
            </li>
            <li>
              <Link
                href="http://creativecommons.org/licenses/by-nc/4.0/"
                className="hover:[--dashboard-button-hover] text-[--dashboard-button] active:text-[--dashboard-button]"
                style={{ transition: 'color 0.2s' }}
              >
                CC BY-NC
              </Link>
            </li>
            <li>
              <Link
                href="http://creativecommons.org/licenses/by-nc-nd/4.0/"
                className="hover:[--dashboard-button-hover] text-[--dashboard-button] active:text-[--dashboard-button]"
                style={{ transition: 'color 0.2s' }}
              >
                CC BY-NC-ND
              </Link>
            </li>
            <li>
              <Link
                href="https://creativecommons.org/licenses/by-nc-sa/4.0/"
                className="hover:[--dashboard-button-hover] text-[--dashboard-button] active:text-[--dashboard-button]"
                style={{ transition: 'color 0.2s' }}
              >
                CC BY-NC-SA
              </Link>
            </li>
            <li>
              <Link
                href="https://creativecommons.org/licenses/by-nd/4.0/"
                className="hover:[--dashboard-button-hover] text-[--dashboard-button] active:text-[--dashboard-button]"
                style={{ transition: 'color 0.2s' }}
              >
                CC BY-ND
              </Link>
            </li>
            <li>
              <Link
                href="https://creativecommons.org/licenses/by-sa/4.0/"
                className="hover:[--dashboard-button-hover] text-[--dashboard-button] active:text-[--dashboard-button]"
                style={{ transition: 'color 0.2s' }}
              >
                CC BY-SA
              </Link>
            </li>
            <li>
              <Link
                href="https://creativecommons.org/public-domain/cc0/"
                className="hover:[--dashboard-button-hover] text-[--dashboard-button] active:text-[--dashboard-button]"
                style={{ transition: 'color 0.2s' }}
              >
                CC0
              </Link>
            </li>
            <li>
              <Link
                href="https://www.springeropen.com/get-published/copyright"
                className="hover:[--dashboard-button-hover] text-[--dashboard-button] active:text-[--dashboard-button]"
                style={{ transition: 'color 0.2s' }}
              >
                Springer Open Access License
              </Link>
            </li>
          </ul>
        </div>
      </MainPageBackground>

      <GlobalFooter />
    </>
  )
}

export const CropwizardLicenseDisclaimer = () => {
  return (
    <>
      <span>
        <p>
          CropWizard&apos;s document corpus is subject to{' '}
          <Link
            className="hover:[--dashboard-button-hover] text-[--dashboard-button] active:text-[--dashboard-button]"
            href="/cropwizard-licenses"
            style={{ transition: 'color 0.2s' }}
            target="_blank"
            rel="noopener noreferrer"
          >
            licenses
          </Link>
          . Usage is subject to{' '}
          <Link
            className="hover:[--dashboard-button-hover] text-[--dashboard-button] active:text-[--dashboard-button]"
            href="https://www.vpaa.uillinois.edu/resources/terms_of_use"
            style={{ transition: 'color 0.2s' }}
            target="_blank"
            rel="noopener noreferrer"
          >
            terms
          </Link>
          , a{' '}
          <Link
            className="hover:[--dashboard-button-hover] text-[--dashboard-button] active:text-[--dashboard-button]"
            href="https://www.vpaa.uillinois.edu/resources/web_privacy"
            style={{ transition: 'color 0.2s' }}
            target="_blank"
            rel="noopener noreferrer"
          >
            privacy policy
          </Link>
          , and{' '}
          <Link
            className="hover:[--dashboard-button-hover] text-[--dashboard-button] active:text-[--dashboard-button]"
            href="https://www.vpaa.uillinois.edu/digital_risk_management/generative_ai/"
            style={{ transition: 'color 0.2s' }}
            target="_blank"
            rel="noopener noreferrer"
          >
            generative AI policy
          </Link>
          . Sorry, the legal team made us say that.
        </p>
      </span>
      <br></br>
    </>
  )
}

export default CropwizardLicenses
