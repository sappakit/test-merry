import jwt from "jsonwebtoken";
import connectionPool from "@/utils/db";

export default async function handler(req, res) {
  if (req.method === "POST") {
    try {
      // ดึง JWT Token จาก Headers (Authorization: Bearer <token>)
      const token = req.headers["authorization"]?.split(" ")[1];

      // ถ้าไม่มี Token ให้ตอบกลับสถานะ 401 (Unauthorized)
      if (!token) {
        return res.status(401).json({ error: "Unauthorized" });
      }

      let userId; // ตัวแปรที่จะเก็บ userId ที่ได้จาก token (payload)

      // ตรวจสอบและ decode Token
      try {
        const decodedToken = jwt.verify(token, process.env.SECRET_KEY); // ตรวจสอบความถูกต้องของ Token
        console.log("Decoded Token:", decodedToken);

        userId = decodedToken.id; // ดึง ID ผู้ใช้จาก payload ของ Token
      } catch (err) {
        console.error("Invalid token:", err.message);
        return res.status(401).json({ error: "Invalid token" }); // ส่งข้อความแจ้งเตือนหาก token ไม่ถูกต้อง
      }

      // ดึงข้อมูลจาก body ของ request
      const { issue, description } = req.body;

      // ตรวจสอบความสมบูรณ์ของข้อมูลที่ส่งมาว่าไม่ว่างเปล่า
      if (!issue || !description) {
        return res.status(400).json({ error: "Missing required fields" }); // ขาดฟิลด์ที่จำเป็น
      }

      // แสดงข้อมูลที่ได้รับจาก frontend ใน console
      console.log("Received data:", { userId, issue, description });

      // Query SQL สำหรับเพิ่มข้อมูลการร้องเรียนลงในตาราง "complaint"
      const query = `
        INSERT INTO complaint (user_id, issue, description)
        VALUES ($1, $2, $3)
        RETURNING complaint_id, issue, description;
      `;
      const values = [userId, issue, description]; // ข้อมูลที่จะ bind เข้าไปใน query

      // รันคำสั่ง SQL เพื่อเพิ่มข้อมูล
      const result = await connectionPool.query(query, values);

      // แสดงข้อมูลที่ถูกเพิ่มใน console
      console.log("Inserted complaint:", result.rows[0]);

      // ตอบกลับสถานะ 201 (Created) พร้อมกับข้อมูลที่ถูกเพิ่มในฐานข้อมูล
      res.status(201).json(result.rows[0]);
    } catch (error) {
      // หากเกิดข้อผิดพลาดในขั้นตอนการทำงาน
      console.error("Error inserting complaint:", error);
      res.status(500).json({ error: "Internal Server Error" }); // ตอบกลับสถานะ 500
    }
  } else {
    // ถ้า request ไม่ใช่ POST ให้ตอบกลับสถานะ 405 (Method Not Allowed)
    res.status(405).json({ error: "Method Not Allowed" });
  }
}
