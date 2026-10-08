require("dotenv").config();

const multer = require("multer");
const express = require("express");
const path = require("path");
const fs = require("fs");
const bcrypt = require("bcryptjs");
const db = require("./db");

const app = express();
const PORT = process.env.PORT || 5000;


// ===============================
// MIDDLEWARE
// ===============================

// Allow JSON data
app.use(express.json());

// Allow form data
app.use(express.urlencoded({ extended: true }));


// ===============================
// PROJECT ROOT
// ===============================

const projectRoot = path.join(__dirname, "..");


// ===============================
// FILE UPLOAD CONFIGURATION
// ===============================

const storage = multer.diskStorage({

    destination: function (req, file, cb) {

        cb(
            null,
            path.join(projectRoot, "uploads")
        );

    },


    filename: function (req, file, cb) {

        const uniqueName =
            Date.now() + "-" + file.originalname;

        cb(
            null,
            uniqueName
        );

    }

});


const upload = multer({
    storage: storage
});


// ===============================
// SERVE FRONTEND FILES
// ===============================

// Serve CSS
app.use(
    "/css",
    express.static(
        path.join(projectRoot, "css")
    )
);


// Serve JavaScript
app.use(
    "/js",
    express.static(
        path.join(projectRoot, "js")
    )
);


// Serve pages through /pages
app.use(
    "/pages",
    express.static(
        path.join(projectRoot, "pages")
    )
);


// Serve HTML pages directly from root URL
// This allows:
// http://localhost:5000/login.html
// http://localhost:5000/register.html
// http://localhost:5000/notes.html
// etc.
app.use(
    express.static(
        path.join(projectRoot, "pages")
    )
);


// Serve uploaded files
app.use(
    "/uploads",
    express.static(
        path.join(projectRoot, "uploads")
    )
);


// ===============================
// HOMEPAGE
// ===============================

app.get("/", (req, res) => {

    res.sendFile(
        path.join(
            projectRoot,
            "pages",
            "index.html"
        )
    );

});


// ===============================
// REGISTER NEW USER
// ===============================

app.post("/api/register", async (req, res) => {

    try {

        const {
            full_name,
            email,
            password
        } = req.body;


        if (
            !full_name ||
            !email ||
            !password
        ) {

            return res.status(400).json({

                message:
                    "All fields are required."

            });

        }


        const checkSql =
            "SELECT id FROM users WHERE email = ?";


        db.query(
            checkSql,
            [email],
            async (err, results) => {

                if (err) {

                    console.error(err);

                    return res.status(500).json({

                        message:
                            "Database error."

                    });

                }


                if (results.length > 0) {

                    return res.status(400).json({

                        message:
                            "Email already registered."

                    });

                }


                const hashedPassword =
                    await bcrypt.hash(
                        password,
                        10
                    );


                const insertSql = `
                    INSERT INTO users
                    (full_name, email, password)
                    VALUES (?, ?, ?)
                `;


                db.query(
                    insertSql,
                    [
                        full_name,
                        email,
                        hashedPassword
                    ],
                    (err, result) => {

                        if (err) {

                            console.error(err);

                            return res.status(500).json({

                                message:
                                    "Registration failed."

                            });

                        }


                        res.status(201).json({

                            message:
                                "Registration successful!"

                        });

                    }
                );

            }
        );

    } catch (error) {

        console.error(error);

        res.status(500).json({

            message:
                "Server error."

        });

    }

});


// ===============================
// LOGIN USER
// ===============================

app.post("/api/login", (req, res) => {

    const {
        email,
        password
    } = req.body;


    if (
        !email ||
        !password
    ) {

        return res.status(400).json({

            message:
                "Email and password are required."

        });

    }


    const sql =
        "SELECT * FROM users WHERE email = ?";


    db.query(
        sql,
        [email],
        async (err, results) => {

            if (err) {

                console.error(err);

                return res.status(500).json({

                    message:
                        "Database error."

                });

            }


            if (results.length === 0) {

                return res.status(401).json({

                    message:
                        "Invalid email or password."

                });

            }


            const user = results[0];


            const passwordMatch =
                await bcrypt.compare(
                    password,
                    user.password
                );


            if (!passwordMatch) {

                return res.status(401).json({

                    message:
                        "Invalid email or password."

                });

            }


            res.json({

                message:
                    "Login successful!",

                user: {

                    id:
                        user.id,

                    full_name:
                        user.full_name,

                    email:
                        user.email,

                    role:
                        user.role

                }

            });

        }
    );

});


// ===============================
// NOTES API
// ===============================

// Get all notes
app.get("/api/notes", (req, res) => {

    const sql = `
        SELECT 
            notes.id,
            notes.title,
            notes.subject,
            notes.description,
            notes.file_name,
            notes.file_type,
            notes.blob_name,
            notes.downloads,
            notes.created_at,
            users.full_name AS uploaded_by
        FROM notes
        JOIN users
            ON notes.user_id = users.id
        ORDER BY notes.created_at DESC
    `;


    db.query(
        sql,
        (err, results) => {

            if (err) {

                console.error(
                    "❌ Error fetching notes:",
                    err
                );

                return res.status(500).json({

                    message:
                        "Failed to fetch notes."

                });

            }


            res.json(results);

        }
    );

});


// ===============================
// UPLOAD NOTE API
// ===============================

app.post(
    "/api/upload",
    upload.single("file"),
    (req, res) => {

        try {

            const {
                user_id,
                title,
                subject,
                description
            } = req.body;


            // Check required information
            if (
                !user_id ||
                !title ||
                !subject ||
                !req.file
            ) {

                return res.status(400).json({

                    message:
                        "Please provide all required information."

                });

            }


            // Get uploaded file information
            const fileName =
                req.file.originalname;


            const fileType =
                path.extname(
                    req.file.originalname
                )
                .replace(".", "")
                .toLowerCase();


            const storedFileName =
                req.file.filename;


            // Insert note into database
            const sql = `
                INSERT INTO notes
                (
                    user_id,
                    title,
                    subject,
                    description,
                    file_name,
                    file_type,
                    blob_name
                )
                VALUES (?, ?, ?, ?, ?, ?, ?)
            `;


            db.query(
                sql,
                [
                    user_id,
                    title,
                    subject,
                    description || "",
                    fileName,
                    fileType,
                    storedFileName
                ],
                (err, result) => {

                    if (err) {

                        console.error(
                            "❌ Error saving note:",
                            err
                        );

                        return res.status(500).json({

                            message:
                                "Failed to save note."

                        });

                    }


                    res.status(201).json({

                        message:
                            "Study material uploaded successfully!",

                        note_id:
                            result.insertId

                    });

                }
            );


        } catch (error) {

            console.error(
                "❌ Upload error:",
                error
            );

            res.status(500).json({

                message:
                    "Server error during upload."

            });

        }

    }
);


// ===============================
// DELETE NOTE API
// ===============================

app.delete("/api/notes/:id", (req, res) => {

    const noteId = req.params.id;


    // First, find the file belonging to this note
    const selectSql = `
        SELECT blob_name
        FROM notes
        WHERE id = ?
    `;


    db.query(
        selectSql,
        [noteId],
        (err, results) => {

            if (err) {

                console.error(
                    "❌ Error finding note:",
                    err
                );

                return res.status(500).json({

                    message:
                        "Database error."

                });

            }


            // Note doesn't exist
            if (results.length === 0) {

                return res.status(404).json({

                    message:
                        "Note not found."

                });

            }


            const fileName =
                results[0].blob_name;


            // Delete note from database
            const deleteSql = `
                DELETE FROM notes
                WHERE id = ?
            `;


            db.query(
                deleteSql,
                [noteId],
                (err) => {

                    if (err) {

                        console.error(
                            "❌ Error deleting note:",
                            err
                        );

                        return res.status(500).json({

                            message:
                                "Failed to delete note."

                        });

                    }


                    // Delete the uploaded file
                    if (fileName) {

                        const filePath =
                            path.join(
                                projectRoot,
                                "uploads",
                                fileName
                            );


                        if (
                            fs.existsSync(filePath)
                        ) {

                            fs.unlinkSync(filePath);

                        }

                    }


                    res.json({

                        message:
                            "Note deleted successfully!"

                    });

                }
            );

        }
    );

});


// ===============================
// UPDATE NOTE API
// ===============================

app.put("/api/notes/:id", (req, res) => {

    const noteId = req.params.id;


    const {
        title,
        subject,
        description
    } = req.body;


    // Check required information
    if (
        !title ||
        !subject
    ) {

        return res.status(400).json({

            message:
                "Title and subject are required."

        });

    }


    // Update note in database
    const sql = `
        UPDATE notes
        SET
            title = ?,
            subject = ?,
            description = ?
        WHERE id = ?
    `;


    db.query(
        sql,
        [
            title,
            subject,
            description || "",
            noteId
        ],
        (err, result) => {

            if (err) {

                console.error(
                    "❌ Error updating note:",
                    err
                );

                return res.status(500).json({

                    message:
                        "Failed to update note."

                });

            }


            // Check if note exists
            if (result.affectedRows === 0) {

                return res.status(404).json({

                    message:
                        "Note not found."

                });

            }


            res.json({

                message:
                    "Note updated successfully!"

            });

        }
    );

});


// ===============================
// START SERVER
// ===============================

app.listen(PORT, () => {

    console.log(
        `🚀 StudyHub server running on http://localhost:${PORT}`
    );

});