# Sim AI: Signing In, Approval, and Project Tools

Illinois Chat uses [Sim AI](https://sim.ai) as its tool platform: workflows built and
deployed in a Sim workspace become tools that chatbots can call during a conversation.
This guide covers how to get access to Sim, how admin approval works, and how to wire a
Sim workspace into an Illinois Chat project.

## 1. Signing in to Sim with your Illinois identity (Keycloak SSO)

Sim shares the same Keycloak realm as Illinois Chat, so you sign in to Sim with the same
account you use for the chat app — there is no separate Sim password.

1. Open the Sim app (`http://localhost:3010` on the local stack, or your deployment's
   Sim URL).
2. On the login page, enter your email address and choose the single sign-on option.
   Email domains listed in `SIM_SSO_DOMAIN` (default: `illinois.edu,gmail.com`) are
   routed to the Keycloak provider.
3. You are redirected to Keycloak. Log in with your Illinois Chat credentials.
4. Keycloak sends you back to Sim, which creates your Sim identity automatically on the
   first sign-in.

### Waiting for approval

New Sim accounts do **not** get access immediately. Every first sign-in lands in a
`pending` state ("Pending admin approval") and the account is held until a Sim platform
admin approves it. If you see a message that your account is banned or pending, nothing
is wrong — an admin simply has not approved you yet. Contact your deployment's Sim
admin, then sign in again once you have been approved; there is no need to re-register.

## 2. How admin approval works

The approval gate lives in Sim's own database (`infra/docker/sim/approval-setup.sql`): a
`sim_user_approval` table stores one decision per email (`pending`, `approved`, or
`blocked`), and database triggers enforce it on Sim's user and session tables. The
bootstrap platform admin is the address in `SIM_APPROVAL_ADMIN_EMAIL` (required in
`.env`; the Sim stack refuses to start without it).

Admins have two equivalent ways to act on a request:

- **In Sim's UI**: sign in as a platform admin and open **Settings → Admin**. Pending
  users appear as banned; use **Unban** to approve them. Banning a user blocks them
  again. Actions taken here are mirrored into the approval table automatically.
- **In the database**: update the row directly, e.g.
  `UPDATE sim_user_approval SET status = 'approved' WHERE email = 'someone@illinois.edu';`
  Valid statuses are `approved`, `pending`, and `blocked`.

Decisions take effect immediately: approving unlocks the account on the next sign-in,
and blocking revokes the user's live Sim sessions on the spot. Setting `is_admin = true`
on a row promotes that user to Sim platform admin.

## 3. Connecting a Sim workspace to an Illinois Chat project

Tools are configured per project by a project owner or admin on the project's **Tools**
page (`/<project-name>/tools`, "Tools" in the sidebar). You need two values from Sim:

1. **API key** — in Sim, open **Settings → Sim Keys** and create an API key
   (`sk-sim-...`). The key is stored encrypted server-side and only a masked version is
   ever shown again.
2. **Workspace ID** — in Sim, open the workspace you want to connect; the workspace ID
   is the identifier in the browser URL (`.../workspace/<workspace-id>/...`) and in the
   workspace settings.

On the Tools page:

1. Paste the **API Key** and **Workspace ID**.
2. **Base URL** is optional: leave it blank to use the deployment default. Set it only
   when pointing the project at a different Sim instance — the URL must be sim.ai or an
   origin the operator has allowlisted (`SIM_API_BASE_URL` / `SIM_ALLOWED_SIM_ORIGINS`),
   otherwise saving is rejected.
3. Save. The page lists every **deployed** workflow discovered in the workspace, along
   with the input fields each workflow expects.

Only deployed workflows are discovered — drafts do not appear until you deploy them in
Sim. Give each workflow a clear description in Sim: the description is what the model
reads when deciding whether to call your tool, and undescribed workflows are flagged on
the Tools page with a placeholder description.

The Tools page also shows the project's tool-routing status: **Custom router** (tool
calls are routed through the project's own OpenAI or OpenAI-compatible provider),
**Default router** (the Illinois-hosted model does the routing), or **Offline** (no
router is configured — add an LLM key or ask the operator to configure the hosted
default).

## 4. Letting others build tools in your workspace

Tool building happens in Sim, so collaboration is managed with Sim's own workspace
membership:

1. Each collaborator first needs Sim access: they sign in via SSO once (section 1) and a
   platform admin approves them (section 2).
2. In Sim, open your workspace and invite them by email from the workspace's member
   management, granting write (edit) permission so they can create and deploy workflows.
3. Anything they deploy in that workspace automatically appears on the Tools page of
   every Illinois Chat project connected to that workspace ID — no extra configuration
   in Illinois Chat is needed.

Keep in mind that the project's Sim API key is what executes the tools, and workspace
membership is what controls who can add or change them. Removing someone from the
workspace (or blocking their Sim account) immediately stops them from editing tools;
undeploying a workflow in Sim removes it from every connected project's tool list.

In chat, users can toggle individual tools on or off per conversation from the settings
panel's Tools tab; enabled tools are offered to the model automatically when a message
looks like it needs one.
