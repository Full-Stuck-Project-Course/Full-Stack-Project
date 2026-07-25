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
        if (file.fieldname === "testPhoto")    folder = "vehicle-docs";
        if (file.fieldname === "insurancePhoto") folder = "vehicle-docs";
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

function isValidImageFile(file) {
    if (!file?.path) return false;
    try {
        const buffer = fs.readFileSync(file.path);
        if (buffer.length < 12) return false;

        const isJpeg = buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff;
        const isPng = buffer.slice(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
        const isWebp = buffer.slice(0, 4).toString("ascii") === "RIFF" &&
            buffer.slice(8, 12).toString("ascii") === "WEBP";

        if (file.mimetype === "image/jpeg") return isJpeg;
        if (file.mimetype === "image/png") return isPng;
        if (file.mimetype === "image/webp") return isWebp;
        return false;
    } catch {
        return false;
    }
}

function cleanupFile(file) {
    if (!file?.path) return;
    try {
        fs.unlinkSync(file.path);
    } catch {}
}

const upload = multer({ storage, fileFilter, limits: { fileSize: 5 * 1024 * 1024 } });

upload.isValidImageFile = isValidImageFile;
upload.cleanupFile = cleanupFile;

module.exports = upload;
