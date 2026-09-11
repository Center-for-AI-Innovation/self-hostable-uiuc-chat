import React from 'react'
import { useAuth } from 'react-oidc-context'
import { useQueryClient } from '@tanstack/react-query'

import HeaderStepNavigation from './HeaderStepNavigation'

import LargeDropzone from '../LargeDropzone'
import CanvasIngestForm from '../CanvasIngestForm'
import CourseraIngestForm from '../CourseraIngestForm'
import GitHubIngestForm from '../GitHubIngestForm'
import MITIngestForm from '../MITIngestForm'
import WebsiteIngestForm from '../WebsiteIngestForm'
import { type FileUpload } from '../UploadNotification'
import { type CourseMetadata } from '~/types/courseMetadata'

interface StepUploadProps {
  project_name: string
  uploadFiles: FileUpload[]
  setUploadFiles: React.Dispatch<React.SetStateAction<FileUpload[]>>
  courseMetadata?: CourseMetadata
}

const StepUpload = ({
  project_name,
  uploadFiles,
  setUploadFiles,
  courseMetadata,
}: StepUploadProps) => {
  const auth = useAuth()
  const queryClient = useQueryClient()

  // Default metadata for new courses when none is provided
  const defaultMetadata: CourseMetadata = {
    is_frozen: false,
    course_owner: auth.user?.profile.email || '',
    course_admins: [],
    approved_emails_list: [],
    is_private: false,
    banner_image_s3: undefined,
    course_intro_message: undefined,
    system_prompt: undefined,
    openai_api_key: undefined,
    disabled_models: undefined,
    project_description: undefined,
    documentsOnly: undefined,
    disableCitations: undefined,
    guidedLearning: undefined,
    systemPromptOnly: undefined,
    vector_search_rewrite_disabled: undefined,
    allow_logged_in_users: undefined,
    example_questions: undefined,
  }

  return (
    <>
      <div className="step">
        <HeaderStepNavigation
          project_name={project_name}
          title="Add Content"
          description="Choose what your bot knows. You can always add more data later."
        />

        {/* step content - core step information */}
        <div className="step_content">
          {/* Import section */}
          <h3 className="mt-6 mb-3 text-base font-semibold text-(--foreground)">
            Import from URLs & Platforms
          </h3>
          <div className="grid grid-cols-3 gap-5 max-[1192px]:grid-cols-2 max-[1192px]:gap-4 max-[768px]:grid-cols-1 max-[768px]:gap-3">
            <CanvasIngestForm
              project_name={project_name}
              setUploadFiles={setUploadFiles}
              queryClient={queryClient}
            />

            <WebsiteIngestForm
              project_name={project_name}
              uploadFiles={uploadFiles}
              setUploadFiles={setUploadFiles}
              queryClient={queryClient}
            />

            <GitHubIngestForm
              project_name={project_name}
              uploadFiles={uploadFiles}
              setUploadFiles={setUploadFiles}
              queryClient={queryClient}
            />

            <MITIngestForm
              project_name={project_name}
              setUploadFiles={setUploadFiles}
              queryClient={queryClient}
            />

            <CourseraIngestForm />
          </div>

          {/* Upload section */}
          <h3 className="mt-6 mb-3 text-base font-semibold text-(--foreground)">
            Upload Files
          </h3>
          <LargeDropzone
            courseName={project_name}
            current_user_email={auth.user?.profile.email || ''}
            isDisabled={false}
            is_new_course={false}
            uploadFiles={uploadFiles}
            setUploadFiles={setUploadFiles}
            queryClient={queryClient}
            courseMetadata={courseMetadata || defaultMetadata}
            auth={auth}
          />
        </div>
      </div>
    </>
  )
}

export default StepUpload
