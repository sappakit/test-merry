import connectionPool from "@/utils/db";
import { v2 as cloudinary } from "cloudinary";
import streamifier from "streamifier";
import multer from "multer";
import jwt from "jsonwebtoken";

// ตั้งค่า Cloudinary
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

// ตั้งค่า multer ให้ใช้ MemoryStorage
const multerUpload = multer({ storage: multer.memoryStorage() });

// กำหนด config สำหรับ Next.js API Route (ต้องปิด bodyParser)
export const config = {
  api: {
    bodyParser: false, // ปิด bodyParser เพื่อให้ multer จัดการ request body เอง
  },
};

// ฟังก์ชันอัปโหลดไฟล์ไปยัง Cloudinary โดยใช้ Buffer
const cloudinaryUpload = (fileBuffer) => {
  return new Promise((resolve, reject) => {
    const uploadStream = cloudinary.uploader.upload_stream((error, result) => {
      if (error) return reject(error);
      resolve(result);
    });
    streamifier.createReadStream(fileBuffer).pipe(uploadStream);
  });
};

export default async function handle(req, res) {
  if (req.method === "POST") {
    // ใช้ multerUpload จัดการอัปโหลดไฟล์จาก FormData
    multerUpload.single("icon")(req, res, async (err) => {
      if (err) {
        console.error("File upload error:", err);
        return res
          .status(500)
          .json({ error: "File upload failed", details: err.message });
      }

      try {
        // ดึง token จาก Authorization Header
        const authHeader = req.headers.authorization;
        if (!authHeader || !authHeader.startsWith("Bearer ")) {
          return res.status(401).json({ error: "Unauthorized" });
        }
        const token = authHeader.split(" ")[1]; // แยก token ออกจาก "Bearer <token>"

        let adminId;
        try {
          const decodedToken = jwt.verify(token, process.env.SECRET_KEY);
          console.log("Decoded Token:", decodedToken);

          adminId = decodedToken.admin_id; // ดึง admin_id จาก payload ของ token
        } catch (err) {
          console.error("Invalid token:", err.message);
          return res.status(401).json({ error: "Invalid token" });
        }

        const { package_name, merry_limit, price, details } = req.body;

        // Validation ข้อมูล
        if (!package_name || !merry_limit || !price) {
          return res.status(400).json({ error: "Missing required fields." });
        }

        // แปลง price เป็นตัวเลข
        const numericPrice = Number(price);

        // แปลง `details` เป็น JSON
        let parsedDetails = [];
        if (details) {
          try {
            parsedDetails = JSON.parse(details); // แปลง JSON string กลับเป็น array
          } catch (error) {
            console.error("Error parsing details:", error.message);
            return res.status(400).json({ error: "Invalid details format." });
          }
        }

        // อัปโหลดรูปภาพไปยัง Cloudinary
        let iconUrl = null;
        if (req.file) {
          const uploadResult = await cloudinaryUpload(req.file.buffer);
          iconUrl = uploadResult.url; // เก็บเฉพาะ URL ของรูปภาพ
        }

        const query = `
            INSERT INTO packages (name_package, description, limit_match, price, icon_url, created_date, updated_date, created_by)
            VALUES ($1, $2, $3, $4, $5, NOW(), NOW(), $6)
          `;
        const values = [
          package_name,
          JSON.stringify(parsedDetails),
          merry_limit,
          numericPrice,
          iconUrl,
          adminId, // ใช้ adminId จาก token
        ];

        await connectionPool.query(query, values);

        return res.status(201).json({ message: "Package added successfully!" });
      } catch (error) {
        console.error("Database Error: ", error.message);
        console.error("Error Stack: ", error.stack);
        return res.status(500).json({ error: "Failed to add package." });
      }
    });
  } else if (req.method === "GET") {
    // ดึงข้อมูลแพ็กเกจทั้งหมด
    try {
      const query = `SELECT * FROM packages ORDER BY created_date DESC`;
      const { rows } = await connectionPool.query(query);
      return res.status(200).json(rows);
    } catch (error) {
      console.error("Database Error: ", error.message);
      return res.status(500).json({ error: "Failed to fetch packages." });
    }
  } else {
    res.setHeader("Allow", ["POST", "GET"]);
    return res.status(405).end(`Method ${req.method} Not Allowed`);
  }
}
