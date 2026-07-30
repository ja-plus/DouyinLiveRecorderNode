/**
 * Message push module - supports multiple notification channels
 */
import nodemailer from 'nodemailer';
import { postJson } from '../http/client.js';
import logger from '../logger.js';

/**
 * DingTalk push notification
 */
export async function dingtalk(url, content, number = '', isAtall = false) {
  const success = [];
  const error = [];
  const apiList = url ? url.replace('，', ',').split(',') : [];

  for (const api of apiList) {
    if (!api.trim()) continue;
    try {
      const result = await postJson(api.trim(), {
        msgtype: 'text',
        text: { content },
        at: { atMobiles: number ? [number] : [], isAtAll: isAtall }
      });
      const data = JSON.parse(result);
      if (data.errcode === 0) {
        success.push(api);
      } else {
        error.push(api);
        console.log(`钉钉推送失败, 推送地址：${api}, ${data.errmsg}`);
      }
    } catch (e) {
      error.push(api);
      console.log(`钉钉推送失败, 推送地址：${api}, 错误信息:${e.message}`);
    }
  }
  return { success, error };
}

/**
 * WeChat (Xizhi) push notification
 */
export async function xizhi(url, title, content) {
  const success = [];
  const error = [];
  const apiList = url ? url.replace('，', ',').split(',') : [];

  for (const api of apiList) {
    if (!api.trim()) continue;
    try {
      const result = await postJson(api.trim(), { title, content });
      const data = JSON.parse(result);
      if (data.code === 200) {
        success.push(api);
      } else {
        error.push(api);
        console.log(`微信推送失败, 推送地址：${api}, 失败信息：${data.msg}`);
      }
    } catch (e) {
      error.push(api);
      console.log(`微信推送失败, 推送地址：${api}, 错误信息:${e.message}`);
    }
  }
  return { success, error };
}

/**
 * Telegram bot push notification
 */
export async function tgBot(chatId, token, content) {
  try {
    const url = `https://api.telegram.org/bot${token}/sendMessage`;
    const result = await postJson(url, { chat_id: chatId, text: content });
    JSON.parse(result);
    return { success: [1], error: [] };
  } catch (e) {
    console.log(`tg推送失败, 聊天ID：${chatId}, 错误信息:${e.message}`);
    return { success: [], error: [1] };
  }
}

/**
 * Email push notification
 */
export async function sendEmail(emailHost, loginEmail, emailPass, senderEmail, senderName, toEmail, title, content, smtpPort = null, openSsl = true) {
  const receivers = toEmail ? toEmail.replace('，', ',').split(',') : [];
  try {
    const port = parseInt(smtpPort) || (openSsl ? 465 : 25);
    const transporter = nodemailer.createTransport({
      host: emailHost,
      port,
      secure: openSsl,
      auth: { user: loginEmail, pass: emailPass }
    });

    await transporter.sendMail({
      from: `"${senderName}" <${senderEmail}>`,
      to: receivers.join(','),
      subject: title,
      text: content
    });
    return { success: receivers, error: [] };
  } catch (e) {
    console.log(`邮件推送失败, 推送邮箱：${toEmail}, 错误信息:${e.message}`);
    return { success: [], error: receivers };
  }
}

/**
 * Bark push notification (iOS)
 */
export async function bark(api, { title = 'message', content = 'test', level = 'active', sound = '' } = {}) {
  const success = [];
  const error = [];
  const apiList = api ? api.replace('，', ',').split(',') : [];

  for (const _api of apiList) {
    if (!_api.trim()) continue;
    try {
      const result = await postJson(_api.trim(), {
        title, body: content, level, badge: 1, autoCopy: 1, sound, isArchive: 1
      });
      const data = JSON.parse(result);
      if (data.code === 200) {
        success.push(_api);
      } else {
        error.push(_api);
        console.log(`Bark推送失败, 推送地址：${_api}, 失败信息：${data.message}`);
      }
    } catch (e) {
      error.push(_api);
      console.log(`Bark推送失败, 推送地址：${_api}, 错误信息:${e.message}`);
    }
  }
  return { success, error };
}

/**
 * Ntfy push notification
 */
export async function ntfy(api, { title = 'message', content = 'test', tags = 'tada', actionUrl = '', email = '' } = {}) {
  const success = [];
  const error = [];
  const apiList = api ? api.replace('，', ',').split(',') : [];
  const tagList = tags ? tags.replace('，', ',').split(',') : ['partying_face'];
  const actions = actionUrl ? [{ action: 'view', label: 'view live', url: actionUrl }] : [];

  for (const _api of apiList) {
    if (!_api.trim()) continue;
    try {
      const [server, topic] = _api.trim().split(/\/(?=[^/]*$)/);
      const result = await postJson(server, {
        topic, title, message: content, tags: tagList,
        priority: 3, actions, markdown: false, email
      });
      const data = JSON.parse(result);
      if (!data.error) {
        success.push(_api);
      } else {
        error.push(_api);
        console.log(`ntfy推送失败, 推送地址：${_api}, 失败信息：${data.error}`);
      }
    } catch (e) {
      error.push(_api);
      console.log(`ntfy推送失败, 推送地址：${_api}, 错误信息:${e.message}`);
    }
  }
  return { success, error };
}

/**
 * PushPlus push notification
 */
export async function pushplus(token, title, content) {
  const success = [];
  const error = [];
  const tokenList = token ? token.replace('，', ',').split(',') : [];

  for (const _token of tokenList) {
    if (!_token.trim()) continue;
    try {
      const result = await postJson('https://www.pushplus.plus/send', {
        token: _token.trim(), title, content
      });
      const data = JSON.parse(result);
      if (data.code === 200) {
        success.push(_token);
      } else {
        error.push(_token);
        console.log(`PushPlus推送失败, Token：${_token}, 失败信息：${data.msg || '未知错误'}`);
      }
    } catch (e) {
      error.push(_token);
      console.log(`PushPlus推送失败, Token：${_token}, 错误信息:${e.message}`);
    }
  }
  return { success, error };
}

/**
 * Unified push message dispatcher
 */
export async function pushMessage(recordName, liveUrl, content, pushSettings) {
  const msgTitle = pushSettings.pushMessageTitle?.trim() || '直播间状态更新通知';
  const pushChannel = (pushSettings.liveStatusPush || '').toUpperCase();

  const pushFunctions = {
    '微信': () => xizhi(pushSettings.xizhiApiUrl, msgTitle, content),
    '钉钉': () => dingtalk(pushSettings.dingtalkApiUrl, content, pushSettings.dingtalkPhoneNum, pushSettings.dingtalkIsAtall),
    '邮箱': () => sendEmail(
      pushSettings.emailHost, pushSettings.loginEmail, pushSettings.emailPassword,
      pushSettings.senderEmail, pushSettings.senderName, pushSettings.toEmail,
      msgTitle, content, pushSettings.smtpPort, pushSettings.openSmtpSsl
    ),
    'TG': () => tgBot(pushSettings.tgChatId, pushSettings.tgToken, content),
    'BARK': () => bark(pushSettings.barkMsgApi, { title: msgTitle, content, level: pushSettings.barkMsgLevel, sound: pushSettings.barkMsgRing }),
    'NTFY': () => ntfy(pushSettings.ntfyApi, { title: msgTitle, content, tags: pushSettings.ntfyTags, actionUrl: liveUrl, email: pushSettings.ntfyEmail }),
    'PUSHPLUS': () => pushplus(pushSettings.pushplusToken, msgTitle, content),
  };

  for (const [platform, func] of Object.entries(pushFunctions)) {
    if (pushChannel.includes(platform)) {
      try {
        const result = await func();
        console.log(`提示信息：已经将[${recordName}]直播状态消息推送至你的${platform}, 成功${result.success.length}, 失败${result.error.length}`);
      } catch (e) {
        console.log(`直播消息推送到${platform}失败: ${e.message}`);
      }
    }
  }
}
