import express from "express";
import session from "express-session";
import cors from "cors";
import axios from "axios";
import dotenv from "dotenv";
import crypto from "crypto";

dotenv.config();

const app = express();

const PORT = process.env.PORT || 5000;

const LOGIN_URL =
  process.env.SF_LOGIN_URL || "https://login.salesforce.com";

const API_VERSION =
  process.env.SF_API_VERSION || "v65.0";

const REDIRECT_URI =
  process.env.SF_REDIRECT_URI ||
  `http://localhost:${PORT}/auth/callback`;

// ----------------------------------------------------
// Salesforce Objects
// ----------------------------------------------------

const OBJECTS = {
  Account: {
    fields: [
      "Id",
      "Name",
      "Industry",
      "Phone",
      "Website",
      "Type",
      "BillingCity",
      "BillingCountry"
    ],
    createFields: [
      "Name",
      "Industry",
      "Phone",
      "Website",
      "Type"
    ]
  },

  Opportunity: {
    fields: [
      "Id",
      "Name",
      "StageName",
      "CloseDate",
      "Amount",
      "Probability",
      "Type",
      "LeadSource"
    ],
    createFields: [
      "Name",
      "StageName",
      "CloseDate",
      "Amount",
      "Type",
      "LeadSource"
    ]
  },

  Lead: {
    fields: [
      "Id",
      "FirstName",
      "LastName",
      "Company",
      "Title",
      "Email",
      "Phone",
      "Status"
    ],
    createFields: [
      "FirstName",
      "LastName",
      "Company",
      "Title",
      "Email",
      "Phone",
      "Status"
    ]
  },

  Contact: {
    fields: [
      "Id",
      "FirstName",
      "LastName",
      "Email",
      "Phone",
      "Title",
      "Department",
      "AccountId"
    ],
    createFields: [
      "FirstName",
      "LastName",
      "Email",
      "Phone",
      "Title",
      "Department",
      "AccountId"
    ]
  },

  Case: {
    fields: [
      "Id",
      "CaseNumber",
      "Subject",
      "Status",
      "Priority",
      "Origin",
      "Type",
      "Description"
    ],
    createFields: [
      "Subject",
      "Status",
      "Priority",
      "Origin",
      "Type",
      "Description",
      "AccountId",
      "ContactId"
    ]
  }
};

// ----------------------------------------------------
// Middleware
// ----------------------------------------------------

app.use(
  cors({
    origin:
      process.env.CLIENT_URL || "http://localhost:5173",
    credentials: true
  })
);

app.use(express.json({ limit: "1mb" }));

app.use(
  session({
    secret:
      process.env.SESSION_SECRET || "dev-only-secret",

    resave: false,

    saveUninitialized: false,

    cookie: {
      httpOnly: true,
      sameSite: "lax",
      secure: false,
      maxAge: 8 * 60 * 60 * 1000
    }
  })
);

// ----------------------------------------------------
// Authentication Middleware
// ----------------------------------------------------

function requireAuth(req, res, next) {
  if (!req.session.salesforce) {
    return res.status(401).json({
      error: "Not authenticated with Salesforce."
    });
  }

  next();
}

// ----------------------------------------------------
// Helper Functions
// ----------------------------------------------------

function apiUrl(path) {
  return `${reqBaseUrl()}/services/data/${API_VERSION}${path}`;
}

function reqBaseUrl() {
  return (
    process.env.SF_INSTANCE_URL ||
    "https://placeholder.invalid"
  );
}

// ----------------------------------------------------
// Salesforce API Request
// ----------------------------------------------------

async function sfRequest(req, config) {
  const sf = req.session.salesforce;

  if (!sf) {
    throw new Error("Not authenticated");
  }

  try {
    return await axios({
      ...config,

      headers: {
        ...(config.headers || {}),
        Authorization: `Bearer ${sf.access_token}`,
        "Content-Type": "application/json"
      }
    });
  } catch (err) {
    const status = err.response?.status;

    // Access token expired
    if (status === 401 && sf.refresh_token) {
      const refreshed = await refreshAccessToken(req);

      return await axios({
        ...config,

        headers: {
          ...(config.headers || {}),
          Authorization: `Bearer ${refreshed.access_token}`,
          "Content-Type": "application/json"
        }
      });
    }

    throw err;
  }
}

// ----------------------------------------------------
// Refresh Salesforce Access Token
// ----------------------------------------------------

async function refreshAccessToken(req) {
  const sf = req.session.salesforce;

  const body = new URLSearchParams({
    grant_type: "refresh_token",

    client_id:
      process.env.SF_CLIENT_ID,

    refresh_token:
      sf.refresh_token
  });

  if (process.env.SF_CLIENT_SECRET) {
    body.set(
      "client_secret",
      process.env.SF_CLIENT_SECRET
    );
  }

  const response = await axios.post(
    `${LOGIN_URL}/services/oauth2/token`,

    body.toString(),

    {
      headers: {
        "Content-Type":
          "application/x-www-form-urlencoded"
      }
    }
  );

  req.session.salesforce = {
    ...sf,
    ...response.data
  };

  return req.session.salesforce;
}

// ====================================================
// SALESFORCE OAUTH LOGIN
// ====================================================

// ----------------------------------------------------
// Login Route - PKCE
// ----------------------------------------------------

app.get("/auth/login", (req, res) => {
  // Generate PKCE code verifier
  const codeVerifier =
    crypto.randomBytes(32).toString("base64url");

  // Generate PKCE code challenge
  const codeChallenge = crypto
    .createHash("sha256")
    .update(codeVerifier)
    .digest("base64url");

  // Store verifier in session
  req.session.codeVerifier = codeVerifier;

  const params = new URLSearchParams({
    response_type: "code",

    client_id:
      process.env.SF_CLIENT_ID,

    redirect_uri:
      REDIRECT_URI,

    scope:
      "api refresh_token offline_access",

    // PKCE parameters
    code_challenge:
      codeChallenge,

    code_challenge_method:
      "S256"
  });

  const authorizationUrl =
    `${LOGIN_URL}/services/oauth2/authorize?${params.toString()}`;

  res.redirect(authorizationUrl);
});

// ----------------------------------------------------
// OAuth Callback - PKCE
// ----------------------------------------------------

app.get("/auth/callback", async (req, res) => {
  try {
    // Salesforce returned an OAuth error
    if (req.query.error) {
      return res.status(400).send(
        `Salesforce authorization failed: ${
          req.query.error_description ||
          req.query.error
        }`
      );
    }

    // Get the PKCE verifier from the session
    const codeVerifier =
      req.session.codeVerifier;

    if (!codeVerifier) {
      return res
        .status(400)
        .send("PKCE code verifier is missing.");
    }

    // Exchange authorization code for access token
    const body = new URLSearchParams({
      grant_type:
        "authorization_code",

      code:
        req.query.code,

      client_id:
        process.env.SF_CLIENT_ID,

      redirect_uri:
        REDIRECT_URI,

      // PKCE verifier
      code_verifier:
        codeVerifier
    });

    // Add client secret if configured
    if (process.env.SF_CLIENT_SECRET) {
      body.set(
        "client_secret",
        process.env.SF_CLIENT_SECRET
      );
    }

    const tokenResponse =
      await axios.post(
        `${LOGIN_URL}/services/oauth2/token`,

        body.toString(),

        {
          headers: {
            "Content-Type":
              "application/x-www-form-urlencoded"
          }
        }
      );

    // Store Salesforce authentication data
    req.session.salesforce =
      tokenResponse.data;

    // Remove PKCE verifier after successful login
    delete req.session.codeVerifier;

    // Redirect to React frontend
    res.redirect(
      process.env.CLIENT_URL ||
        "http://localhost:5173"
    );
  } catch (err) {
    console.error(
      err.response?.data || err
    );

    res
      .status(500)
      .send(
        "Salesforce OAuth callback failed."
      );
  }
});

// ----------------------------------------------------
// Logout
// ----------------------------------------------------

app.get("/auth/logout", (req, res) => {
  req.session.destroy(() => {
    res.json({
      ok: true
    });
  });
});

// ----------------------------------------------------
// Check Session
// ----------------------------------------------------

app.get("/api/session", (req, res) => {
  const sf =
    req.session.salesforce;

  res.json({
    authenticated: Boolean(sf),

    instanceUrl:
      sf?.instance_url || null
  });
});

// ====================================================
// OBJECT APIs
// ====================================================

// ----------------------------------------------------
// Get Supported Objects
// ----------------------------------------------------

app.get("/api/objects", (req, res) => {
  res.json(
    Object.entries(OBJECTS).map(
      ([name, config]) => ({
        name,

        fields:
          config.fields,

        createFields:
          config.createFields
      })
    )
  );
});

// ----------------------------------------------------
// GET Records
// ----------------------------------------------------

app.get(
  "/api/objects/:object/records",
  requireAuth,
  async (req, res) => {
    try {
      const objectName =
        req.params.object;

      const config =
        OBJECTS[objectName];

      if (!config) {
        return res.status(400).json({
          error:
            "Unsupported object."
        });
      }

      const limit = Math.min(
        Number(req.query.limit) || 20,
        20
      );

      const nextUrl =
        req.query.nextUrl;

      let response;

      // Load next page
      if (nextUrl) {
        response = await sfRequest(
          req,
          {
            method: "GET",
            url: nextUrl
          }
        );
      }

      // Load first page
      else {
        const fields =
          config.fields.join(", ");

        const soql =
          `SELECT ${fields} ` +
          `FROM ${objectName} ` +
          `ORDER BY CreatedDate DESC ` +
          `LIMIT ${limit}`;

        const url =
          `${req.session.salesforce.instance_url}` +
          `/services/data/${API_VERSION}` +
          `/query`;

        response = await sfRequest(
          req,
          {
            method: "GET",

            url,

            params: {
              q: soql
            }
          }
        );
      }

      res.json({
        records:
          response.data.records || [],

        done:
          response.data.done ?? true,

        nextRecordsUrl:
          response.data.nextRecordsUrl
            ? `${req.session.salesforce.instance_url}` +
              `/services/data/${API_VERSION}` +
              `${response.data.nextRecordsUrl}`
            : null
      });
    } catch (err) {
      console.error(
        err.response?.data || err
      );

      res
        .status(
          err.response?.status || 500
        )
        .json({
          error:
            err.response?.data ||
            "Failed to load Salesforce records."
        });
    }
  }
);

// ----------------------------------------------------
// CREATE Record
// ----------------------------------------------------

app.post(
  "/api/objects/:object/records",
  requireAuth,
  async (req, res) => {
    try {
      const objectName =
        req.params.object;

      if (!OBJECTS[objectName]) {
        return res.status(400).json({
          error:
            "Unsupported object."
        });
      }

      const url =
        `${req.session.salesforce.instance_url}` +
        `/services/data/${API_VERSION}` +
        `/sobjects/${objectName}`;

      const response =
        await sfRequest(req, {
          method: "POST",

          url,

          data: req.body
        });

      res
        .status(201)
        .json(response.data);
    } catch (err) {
      console.error(
        err.response?.data || err
      );

      res
        .status(
          err.response?.status || 500
        )
        .json({
          error:
            err.response?.data ||
            "Failed to create record."
        });
    }
  }
);

// ----------------------------------------------------
// UPDATE Record
// ----------------------------------------------------

app.patch(
  "/api/objects/:object/records/:id",
  requireAuth,
  async (req, res) => {
    try {
      const objectName =
        req.params.object;

      if (!OBJECTS[objectName]) {
        return res.status(400).json({
          error:
            "Unsupported object."
        });
      }

      const url =
        `${req.session.salesforce.instance_url}` +
        `/services/data/${API_VERSION}` +
        `/sobjects/${objectName}` +
        `/${req.params.id}`;

      const response =
        await sfRequest(req, {
          method: "PATCH",

          url,

          data: req.body
        });

      res
        .status(204)
        .send(response.data || "");
    } catch (err) {
      console.error(
        err.response?.data || err
      );

      res
        .status(
          err.response?.status || 500
        )
        .json({
          error:
            err.response?.data ||
            "Failed to update record."
        });
    }
  }
);

// ----------------------------------------------------
// DELETE Record
// ----------------------------------------------------

app.delete(
  "/api/objects/:object/records/:id",
  requireAuth,
  async (req, res) => {
    try {
      const objectName =
        req.params.object;

      if (!OBJECTS[objectName]) {
        return res.status(400).json({
          error:
            "Unsupported object."
        });
      }

      const url =
        `${req.session.salesforce.instance_url}` +
        `/services/data/${API_VERSION}` +
        `/sobjects/${objectName}` +
        `/${req.params.id}`;

      await sfRequest(req, {
        method: "DELETE",

        url
      });

      res
        .status(204)
        .send();
    } catch (err) {
      console.error(
        err.response?.data || err
      );

      res
        .status(
          err.response?.status || 500
        )
        .json({
          error:
            err.response?.data ||
            "Failed to delete record."
        });
    }
  }
);

// ====================================================
// START SERVER
// ====================================================

app.listen(PORT, () => {
  console.log(
    `Salesforce CRUD server running on http://localhost:${PORT}`
  );
});