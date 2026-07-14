import { Button, Tooltip, message } from "antd";
import { useRef, useState } from "react";
import { FiUploadCloud } from "react-icons/fi";
import { uploadToCloudinary } from "../../lib/cloudinary";

/** Nút upload ảnh lên Cloudinary — dùng cạnh các ô nhập URL ảnh */
export default function UploadImgButton({
  onUploaded,
  size = "middle",
}: {
  onUploaded: (url: string) => void;
  size?: "small" | "middle" | "large";
}) {
  const ref = useRef<HTMLInputElement>(null);
  const [loading, setLoading] = useState(false);

  return (
    <>
      <Tooltip title="Upload ảnh (Cloudinary)">
        <Button
          size={size}
          loading={loading}
          icon={<FiUploadCloud />}
          onClick={() => ref.current?.click()}
        >
          {size !== "small" && "Upload"}
        </Button>
      </Tooltip>
      <input
        ref={ref}
        type="file"
        accept="image/*"
        hidden
        onChange={async (e) => {
          const file = e.target.files?.[0];
          e.target.value = "";
          if (!file) return;
          try {
            setLoading(true);
            const url = await uploadToCloudinary(file);
            onUploaded(url);
            message.success("Đã upload ảnh");
          } catch (err: any) {
            message.error(`Upload thất bại: ${err?.message || err}`);
          } finally {
            setLoading(false);
          }
        }}
      />
    </>
  );
}
