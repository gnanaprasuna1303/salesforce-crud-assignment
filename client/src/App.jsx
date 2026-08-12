import React, { useEffect, useRef, useState } from "react";
import axios from "axios";

const API = import.meta.env.VITE_API_URL || "http://localhost:5000";

function App() {
  const [session, setSession] = useState({ authenticated: false });
  const [objects, setObjects] = useState([]);
  const [selected, setSelected] = useState("Account");
  const [records, setRecords] = useState([]);
  const [nextUrl, setNextUrl] = useState(null);
  const [done, setDone] = useState(true);
  const [loading, setLoading] = useState(false);
  const [editing, setEditing] = useState(null);
  const [message, setMessage] = useState("");

  const loadingRef = useRef(false);
  const nextUrlRef = useRef(null);
  const doneRef = useRef(true);

  const objectConfig = objects.find((x) => x.name === selected);

  // -----------------------------------------
  // Initial session + objects
  // -----------------------------------------
  useEffect(() => {
    axios
      .get(`${API}/api/session`, {
        withCredentials: true,
      })
      .then((r) => {
        setSession(r.data);
      })
      .catch(() => {});

    axios
      .get(`${API}/api/objects`)
      .then((r) => {
        setObjects(r.data);
      })
      .catch((e) => {
        setMessage(errorText(e));
      });
  }, []);

  // -----------------------------------------
  // Load records whenever object changes
  // -----------------------------------------
  useEffect(() => {
    if (session.authenticated) {
      loadFirstPage();
    }
  }, [selected, session.authenticated]);

  // -----------------------------------------
  // Keep refs synchronized
  // -----------------------------------------
  useEffect(() => {
    nextUrlRef.current = nextUrl;
  }, [nextUrl]);

  useEffect(() => {
    doneRef.current = done;
  }, [done]);

  useEffect(() => {
    loadingRef.current = loading;
  }, [loading]);

  // -----------------------------------------
  // Infinite scroll
  // -----------------------------------------
  useEffect(() => {
    if (!session.authenticated) return;

    const handleScroll = () => {
      if (loadingRef.current) return;
      if (doneRef.current) return;
      if (!nextUrlRef.current) return;

      const scrollPosition =
        window.innerHeight + window.scrollY;

      const pageHeight =
        document.documentElement.scrollHeight;

      // Start loading when 500px from bottom
      if (scrollPosition >= pageHeight - 500) {
        loadMore();
      }
    };

    window.addEventListener("scroll", handleScroll);

    return () => {
      window.removeEventListener("scroll", handleScroll);
    };
  }, [session.authenticated]);

  // -----------------------------------------
  // First 20 records
  // -----------------------------------------
  async function loadFirstPage() {
    if (loadingRef.current) return;

    loadingRef.current = true;
    setLoading(true);
    setMessage("");

    try {
      const response = await axios.get(
        `${API}/api/objects/${selected}/records?limit=20`,
        {
          withCredentials: true,
        }
      );

      const newRecords = response.data.records || [];
      const newNextUrl = response.data.nextRecordsUrl || null;
      const newDone = response.data.done ?? true;

      setRecords(newRecords);
      setNextUrl(newNextUrl);
      setDone(newDone);

      nextUrlRef.current = newNextUrl;
      doneRef.current = newDone;
    } catch (e) {
      setMessage(errorText(e));
    } finally {
      loadingRef.current = false;
      setLoading(false);
    }
  }

  // -----------------------------------------
  // Load next 20 records
  // -----------------------------------------
  async function loadMore() {
    const currentNextUrl = nextUrlRef.current;

    if (loadingRef.current) return;
    if (doneRef.current) return;
    if (!currentNextUrl) return;

    loadingRef.current = true;
    setLoading(true);

    try {
      const response = await axios.get(
        `${API}/api/objects/${selected}/records`,
        {
          params: {
            nextUrl: currentNextUrl,
          },
          withCredentials: true,
        }
      );

      const newRecords = response.data.records || [];
      const newNextUrl = response.data.nextRecordsUrl || null;
      const newDone = response.data.done ?? true;

      setRecords((prev) => {
        const existingIds = new Set(prev.map((r) => r.Id));

        const uniqueRecords = newRecords.filter(
          (record) => !existingIds.has(record.Id)
        );

        return [...prev, ...uniqueRecords];
      });

      setNextUrl(newNextUrl);
      setDone(newDone);

      nextUrlRef.current = newNextUrl;
      doneRef.current = newDone;
    } catch (e) {
      setMessage(errorText(e));
    } finally {
      loadingRef.current = false;
      setLoading(false);
    }
  }

  // -----------------------------------------
  // Create / Update record
  // -----------------------------------------
  async function saveRecord(formData) {
    setLoading(true);
    loadingRef.current = true;

    try {
      if (editing?.Id) {
        await axios.patch(
          `${API}/api/objects/${selected}/records/${editing.Id}`,
          formData,
          {
            withCredentials: true,
          }
        );

        setMessage("Record updated successfully.");
      } else {
        await axios.post(
          `${API}/api/objects/${selected}/records`,
          formData,
          {
            withCredentials: true,
          }
        );

        setMessage("Record created successfully.");
      }

      setEditing(null);

      await loadFirstPage();
    } catch (e) {
      setMessage(errorText(e));
    } finally {
      loadingRef.current = false;
      setLoading(false);
    }
  }

  // -----------------------------------------
  // Delete record
  // -----------------------------------------
  async function deleteRecord(id) {
    if (!window.confirm("Delete this record from Salesforce?")) {
      return;
    }

    setLoading(true);
    loadingRef.current = true;

    try {
      await axios.delete(
        `${API}/api/objects/${selected}/records/${id}`,
        {
          withCredentials: true,
        }
      );

      setRecords((prev) =>
        prev.filter((record) => record.Id !== id)
      );

      setMessage("Record deleted successfully.");
    } catch (e) {
      setMessage(errorText(e));
    } finally {
      loadingRef.current = false;
      setLoading(false);
    }
  }

  // -----------------------------------------
  // Error helper
  // -----------------------------------------
  function errorText(e) {
    if (e?.response?.data?.error) {
      return JSON.stringify(e.response.data.error);
    }

    return "Something went wrong.";
  }

  // -----------------------------------------
  // Login screen
  // -----------------------------------------
  if (!session.authenticated) {
    return (
      <div className="login-page">
        <div className="login-card">
          <div className="logo">SF</div>

          <h1>Salesforce CRUD Manager</h1>

          <p>
            Manage Account, Opportunity, Lead, Contact and Case
            records from one web application.
          </p>

          <button
            className="primary"
            onClick={() => {
              window.location.href = `${API}/auth/login`;
            }}
          >
            Login with Salesforce
          </button>

          <small>
            OAuth 2.0 authentication • Salesforce REST API
          </small>
        </div>
      </div>
    );
  }

  // -----------------------------------------
  // Main application
  // -----------------------------------------
  return (
    <div className="app">
      <header className="topbar">
        <div>
          <strong>Salesforce CRUD Manager</strong>

          <span className="badge">
            Connected
          </span>
        </div>

        <button
          className="secondary"
          onClick={async () => {
            await axios.get(`${API}/auth/logout`, {
              withCredentials: true,
            });

            setSession({
              authenticated: false,
            });
          }}
        >
          Logout
        </button>
      </header>

      <main>
        <section className="toolbar">
          <div>
            <label>Salesforce Object</label>

            <select
              value={selected}
              onChange={(e) => {
                setSelected(e.target.value);
              }}
            >
              {objects.map((object) => (
                <option
                  key={object.name}
                  value={object.name}
                >
                  {object.name}
                </option>
              ))}
            </select>
          </div>

          <button
            className="primary"
            onClick={() => setEditing({})}
          >
            + New {selected}
          </button>
        </section>

        {message && (
          <div className="message">
            {message}
          </div>
        )}

        <section className="card">
          <div className="card-head">
            <h2>
              {selected} Records
            </h2>

            <span>
              {records.length} loaded
            </span>
          </div>

          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  {objectConfig?.fields.map((field) => (
                    <th key={field}>
                      {field}
                    </th>
                  ))}

                  <th>
                    Actions
                  </th>
                </tr>
              </thead>

              <tbody>
                {records.map((record) => (
                  <tr key={record.Id}>
                    {objectConfig?.fields.map(
                      (field) => (
                        <td key={field}>
                          {formatValue(
                            record[field]
                          )}
                        </td>
                      )
                    )}

                    <td className="actions">
                      <button
                        onClick={() =>
                          setEditing(record)
                        }
                      >
                        Edit
                      </button>

                      <button
                        className="danger"
                        onClick={() =>
                          deleteRecord(record.Id)
                        }
                      >
                        Delete
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {loading && (
            <div className="loading">
              Loading more records...
            </div>
          )}

          {!loading && !done && nextUrl && (
            <div className="sentinel">
              Scroll down to load more records...
            </div>
          )}

          {!loading && done && (
            <div className="sentinel">
              All available records loaded.
            </div>
          )}
        </section>
      </main>

      {editing !== null && (
        <RecordModal
          objectName={selected}
          fields={
            objectConfig?.createFields || []
          }
          record={editing}
          onClose={() => setEditing(null)}
          onSave={saveRecord}
        />
      )}
    </div>
  );
}

// -----------------------------------------
// Record Modal
// -----------------------------------------
function RecordModal({
  objectName,
  fields,
  record,
  onClose,
  onSave,
}) {
  const [form, setForm] = useState(() => {
    const initial = {};

    fields.forEach((field) => {
      initial[field] =
        record?.[field] ?? "";
    });

    return initial;
  });

  function setValue(field, value) {
    setForm((prev) => ({
      ...prev,
      [field]: value,
    }));
  }

  function submit(e) {
    e.preventDefault();

    const cleaned = {};

    for (const [key, value] of Object.entries(form)) {
      if (value !== "") {
        cleaned[key] = value;
      }
    }

    onSave(cleaned);
  }

  return (
    <div className="modal-backdrop">
      <div className="modal">
        <div className="modal-head">
          <h2>
            {record?.Id
              ? `Edit ${objectName}`
              : `Create ${objectName}`}
          </h2>

          <button onClick={onClose}>
            ×
          </button>
        </div>

        <form onSubmit={submit}>
          {fields.map((field) => (
            <div
              className="field"
              key={field}
            >
              <label>
                {field}
              </label>

              <input
                value={form[field]}
                onChange={(e) =>
                  setValue(
                    field,
                    e.target.value
                  )
                }
                placeholder={`Enter ${field}`}
              />
            </div>
          ))}

          <div className="modal-actions">
            <button
              type="button"
              className="secondary"
              onClick={onClose}
            >
              Cancel
            </button>

            <button
              type="submit"
              className="primary"
            >
              Save
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// -----------------------------------------
// Format Salesforce values
// -----------------------------------------
function formatValue(value) {
  if (
    value === null ||
    value === undefined
  ) {
    return "—";
  }

  if (typeof value === "object") {
    return JSON.stringify(value);
  }

  return String(value);
}

export default App;