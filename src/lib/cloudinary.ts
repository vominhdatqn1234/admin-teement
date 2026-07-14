/** Upload ảnh lên Cloudinary (unsigned preset), trả về secure_url */
export async function uploadToCloudinary(file: File): Promise<string> {
  const cloud = process.env.REACT_APP_CLOUDINARY_CLOUD_NAME;
  const preset = process.env.REACT_APP_CLOUDINARY_UPLOAD_PRESET;
  if (!cloud || !preset) {
    throw new Error(
      "Thiếu REACT_APP_CLOUDINARY_CLOUD_NAME / REACT_APP_CLOUDINARY_UPLOAD_PRESET trong .env"
    );
  }
  const fd = new FormData();
  fd.append("file", file);
  fd.append("upload_preset", preset);
  const res = await fetch(
    `https://api.cloudinary.com/v1_1/${cloud}/image/upload`,
    { method: "POST", body: fd }
  );
  if (!res.ok) {
    throw new Error(`Cloudinary ${res.status}: ${await res.text()}`);
  }
  const json = await res.json();
  return json.secure_url as string;
}
