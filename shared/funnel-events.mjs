// Client-reported stages describe intent/SDK callbacks, not verified recipient reads.
export const funnelEvents = Object.freeze({
 share_clicked:'点击分享渠道',share_page_opened:'分享页面打开',share_invite_created:'邀请链接生成成功',share_copy_failed:'复制链接失败',share_copy_manual:'手动复制操作（未验证剪贴板）',share_ready:'分享界面展示',share_handoff:'发起平台跳转',share_copied:'复制邀请链接成功',share_send_confirmed:'LINE 确认发送成功',share_cancelled:'取消分享',share_failed:'分享操作失败',
 mic_requested:'请求麦克风',mic_granted:'麦克风授权成功',mic_denied:'麦克风不可用或拒绝',recording_started:'开始录音',recording_cancelled:'取消或中断录音',recording_failed:'录音生成失败',upload_started:'开始上传录音',upload_failed:'录音上传失败',upload_full:'录音空间已满',
});
