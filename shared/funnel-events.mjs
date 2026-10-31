// Client-reported stages describe intent/SDK callbacks, not verified recipient reads.
export const funnelEvents = Object.freeze({
 share_invite_api_ready:'邀请 API 响应完成',share_config_ready:'分享配置读取完成',share_config_failed:'分享配置读取失败',share_sdk_loaded:'分享 SDK 下载完成',share_sdk_ready:'分享 SDK 初始化就绪',share_sdk_failed:'分享 SDK 失败',share_login_started:'平台登录开始',share_login_returned:'平台登录返回',share_picker_opened:'调用好友选择器',share_picker_returned:'好友选择器返回',share_fallback_offered:'已提供复制备用出口',share_clicked:'点击分享渠道',share_page_opened:'分享页面打开',share_invite_created:'邀请链接生成成功',share_copy_failed:'复制链接失败',share_copy_manual:'手动复制操作（未验证剪贴板）',share_ready:'分享界面展示',share_handoff:'发起平台跳转',share_copied:'复制邀请链接成功',share_send_confirmed:'平台确认发送成功',share_cancelled:'取消分享',share_failed:'分享操作失败',
 mic_requested:'请求麦克风',mic_granted:'麦克风授权成功',mic_denied:'麦克风不可用或拒绝',recording_started:'开始录音',recording_cancelled:'取消或中断录音',recording_failed:'录音生成失败',upload_started:'开始上传录音',upload_failed:'录音上传失败',upload_full:'录音空间已满',
});
