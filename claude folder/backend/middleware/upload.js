// middleware/upload.js

const multer = require("multer");
const path   = require("path");
const fs     = require("fs");

const BASE = path.join(__dirname, "../uploads");

const storage = multer.diskStorage({
    destination(req, file, cb) {
        let folder = "profiles";
        if (file.fieldname === "idPhoto")      folder = "ids";
        if (file.fieldname === "licensePhoto") folder = "licenses";
        const dir = path.join(BASE, folder);
        fs.mkdirSync(dir, { recursive: true });
        cb(null, dir);
    },
    filename(req, file, cb) {
        const ext  = path.extname(file.originalname);
        const name = Date.now() + "-" + Math.round(Math.random() * 1e6) + ext;
        cb(null, name);
    }
});

const fileFilter = (req, file, cb) => {
    const allowed = [".jpg", ".jpeg", ".png", ".webp"];
    const ext = path.extname(file.originalname).toLowerCase();
    if (allowed.includes(ext)) cb(null, true);
    else cb(new Error("Only image files allowed (jpg, png, webp)"), false);
};

const upload = multer({ storage, fileFilter, limits: { fileSize: 5 * 1024 * 1024 } });

module.exports = upload;
