# Salesforce CRUD Assignment – Associate Software Engineer

A React + Node.js/Express application that authenticates with Salesforce OAuth 2.0 and performs CRUD operations on Account, Opportunity, Lead, Contact and Case records.

## Architecture

React (Vite) → Node.js/Express → Salesforce REST API

The OAuth tokens stay on the server and are stored in the Express session. The browser never receives the Salesforce client secret.

## 1. Salesforce setup

1. Create a Salesforce Developer Org.
2. In Setup, open **External Client App Manager** → **New External Client App**.
3. Enable OAuth.
4. For local development use this callback URL:

   `http://localhost:5000/auth/callback`

5. Add OAuth scopes appropriate for the assignment, including **Manage user data via APIs (api)** and **Perform requests at any time (refresh_token, offline_access)**.
6. Configure the authorization-code based OAuth flow for the External Client App.
7. Copy the Consumer Key. Keep the secret server-side if Salesforce provides one for the selected flow.
8. Put the values in `server/.env`.

Salesforce's current documentation recommends External Client Apps for new integrations.

## 2. Install

Open two terminals.

### Backend

```bash
cd server
npm install
copy .env.example .env
```

On macOS/Linux:

```bash
cp .env.example .env
```

Edit `.env`:

```env
PORT=5000
SESSION_SECRET=replace-with-a-long-random-string
SF_CLIENT_ID=your-consumer-key
SF_CLIENT_SECRET=your-consumer-secret-if-required
SF_LOGIN_URL=https://login.salesforce.com
SF_API_VERSION=v65.0
CLIENT_URL=http://localhost:5173
```

Then:

```bash
npm run dev
```

### Frontend

```bash
cd client
npm install
npm run dev
```

Open:

`http://localhost:5173`

## 3. How it works

- Login button redirects to Salesforce OAuth.
- Salesforce redirects to `/auth/callback`.
- Backend exchanges the authorization code for an access token.
- `/api/session` tells the frontend whether Salesforce is connected.
- `/api/objects/:object/records` uses SOQL and loads 20 records at a time.
- Infinite scroll requests the next 20 using Salesforce query pagination.
- POST/PATCH/DELETE routes use Salesforce sObject REST endpoints.

## 4. Fields

The UI uses 5–10 practical fields per standard object. The server also supports Salesforce `describe` metadata.

Objects:
- Account
- Opportunity
- Lead
- Contact
- Case

## 5. Important

Do not commit `.env` or Salesforce secrets to GitHub.

For production deployment, use HTTPS and a persistent session store rather than the default in-memory Express session store. Update `SF_REDIRECT_URI` and `CLIENT_URL` to the deployed URLs.

## 6. Submission

The project is structured so it can be pushed to GitHub and deployed. Before submission, test all five objects, CRUD operations, OAuth login, and infinite scrolling.
