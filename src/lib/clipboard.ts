import { toast } from "sonner";

/** 复制文本到剪贴板，并用 toast 反馈结果 */
export async function copyToClipboard(text: string, message = "已复制") {
  try {
    await navigator.clipboard.writeText(text);
    toast.success(message);
  } catch {
    toast.error("复制失败，请检查浏览器权限");
  }
}
