// middleware/upload.js

const multer = require("multer");
const path   = require("path");
const fs     = require("fs");

const BASE = path.join(__dirname, "../uploads");

const storage = multer.diskStorage({
    destination(req, file, cb) {
        let folder = "profiles";
        if (file.fieldname === "file")         folder = ".";
        if (file.fieldname === "idPhoto")      folder = "ids";
        if (file.fieldname === "licensePhoto") folder = "licenses";
        const dir = folder === "." ? path.join(__dirname, "../public") : path.join(BASE, folder);
        fs.mkdirSync(dir, { recursive: true });
        cb(null, dir);
    },
    filename(req, file, cb) {
        const ext = path.extname(file.originalname).toLowerCase();
        const name = `${Date.now()}-${Math.round(Math.random() * 1e9)}${ext}`;
        cb(null, name);
    }
});

const fileFilter = (req, file, cb) => {
    const allowed = {
        ".jpg": "image/jpeg",
        ".jpeg": "image/jpeg",
        ".png": "image/png",
        ".webp": "image/webp"
    };
    const ext = path.extname(file.originalname).toLowerCase();
    if (allowed[ext] && allowed[ext] === file.mimetype) cb(null, true);
    else cb(new Error("Only image files allowed (jpg, png, webp)"), false);
};

const upload = multer({ storage, fileFilter, limits: { fileSize: 5 * 1024 * 1024 } });

module.exports = upload;
