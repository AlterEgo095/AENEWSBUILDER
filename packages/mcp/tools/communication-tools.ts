/**
 * Communication MCP Tools Bundle
 * Telegram, Discord, WhatsApp (YCloud), Email (Gmail/IMAP),
 * MS Teams, LINE, Mattermost, Twilio/SMS, Google Calendar, Ntfy, Bluesky
 *
 * Each adapter reads its tokens from environment variables.
 * All HTTP calls use axios; CLI tools use child_process with safety checks.
 */

import axios from 'axios';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

// ═══════════════════════════════════════════════════════════════════════════
// Telegram
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Telegram Bot API adapter
 * Requires TELEGRAM_BOT_TOKEN env var
 */
export class TelegramAdapter {
  private token: string;
  private baseUrl: string;

  constructor(token?: string) {
    this.token = token || process.env.TELEGRAM_BOT_TOKEN || '';
    this.baseUrl = `https://api.telegram.org/bot${this.token}`;
  }

  /** Get bot info */
  async getMe(): Promise<any> {
    try {
      const { data } = await axios.get(`${this.baseUrl}/getMe`);
      return data.ok ? data.result : { error: data.description };
    } catch (error: any) {
      return { error: error.message };
    }
  }

  /** List all chats the bot is part of */
  async getChats(): Promise<any> {
    try {
      const { data } = await axios.get(`${this.baseUrl}/getUpdates`);
      const chatIds = [...new Set(
        (data.result || []).map((u: any) => u.message?.chat).filter(Boolean)
      )];
      return { chats: chatIds, count: chatIds.length };
    } catch (error: any) {
      return { error: error.message };
    }
  }

  /** Send a text message to a chat */
  async sendMessage(chatId: string, text: string): Promise<any> {
    try {
      const { data } = await axios.post(`${this.baseUrl}/sendMessage`, { chat_id: chatId, text });
      return data.ok ? data.result : { error: data.description };
    } catch (error: any) {
      return { error: error.message };
    }
  }

  /** Get recent messages from a chat (via getUpdates) */
  async getMessages(chatId: string, limit: number = 50): Promise<any> {
    try {
      const { data } = await axios.get(`${this.baseUrl}/getUpdates`, {
        params: { limit, allowed_updates: ['message'] },
      });
      const messages = (data.result || [])
        .filter((u: any) => u.message?.chat?.id?.toString() === chatId?.toString())
        .map((u: any) => u.message);
      return { messages, count: messages.length };
    } catch (error: any) {
      return { error: error.message };
    }
  }

  /** Send a photo with optional caption */
  async sendPhoto(chatId: string, photo: string, caption?: string): Promise<any> {
    try {
      const { data } = await axios.post(`${this.baseUrl}/sendPhoto`, {
        chat_id: chatId, photo, caption,
      });
      return data.ok ? data.result : { error: data.description };
    } catch (error: any) {
      return { error: error.message };
    }
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// Discord
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Discord Bot API adapter
 * Requires DISCORD_BOT_TOKEN env var
 */
export class DiscordAdapter {
  private token: string;
  private baseUrl = 'https://discord.com/api/v10';

  constructor(token?: string) {
    this.token = token || process.env.DISCORD_BOT_TOKEN || '';
  }

  /** List all guilds (servers) the bot is in */
  async getGuilds(): Promise<any> {
    try {
      const { data } = await axios.get(`${this.baseUrl}/users/@me/guilds`, {
        headers: { Authorization: `Bot ${this.token}` },
      });
      return { guilds: data.map((g: any) => ({ id: g.id, name: g.name, icon: g.icon })), count: data.length };
    } catch (error: any) {
      return { error: error.message };
    }
  }

  /** List channels in a guild */
  async getChannels(guildId: string): Promise<any> {
    try {
      const { data } = await axios.get(`${this.baseUrl}/guilds/${guildId}/channels`, {
        headers: { Authorization: `Bot ${this.token}` },
      });
      return { channels: data.map((c: any) => ({ id: c.id, name: c.name, type: c.type })), count: data.length };
    } catch (error: any) {
      return { error: error.message };
    }
  }

  /** Send a message to a channel */
  async sendMessage(channelId: string, content: string): Promise<any> {
    try {
      const { data } = await axios.post(`${this.baseUrl}/channels/${channelId}/messages`, { content }, {
        headers: { Authorization: `Bot ${this.token}` },
      });
      return { id: data.id, content: data.content, timestamp: data.timestamp };
    } catch (error: any) {
      return { error: error.message };
    }
  }

  /** Get recent messages from a channel */
  async getMessages(channelId: string, limit: number = 50): Promise<any> {
    try {
      const { data } = await axios.get(`${this.baseUrl}/channels/${channelId}/messages`, {
        headers: { Authorization: `Bot ${this.token}` },
        params: { limit: Math.min(limit, 100) },
      });
      return { messages: data.map((m: any) => ({ id: m.id, author: m.author?.username, content: m.content, timestamp: m.timestamp })), count: data.length };
    } catch (error: any) {
      return { error: error.message };
    }
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// WhatsApp (YCloud)
// ═══════════════════════════════════════════════════════════════════════════

/**
 * WhatsApp adapter via YCloud API
 * Requires YCLOUD_API_KEY env var
 */
export class WhatsAppAdapter {
  private apiKey: string;
  private baseUrl = 'https://api.ycloud.com/v2/whatsapp';

  constructor() {
    this.apiKey = process.env.YCLOUD_API_KEY || '';
  }

  /** Send a WhatsApp message */
  async sendMessage(to: string, content: string): Promise<any> {
    try {
      const { data } = await axios.post(`${this.baseUrl}/messages`, {
        to, type: 'text', text: { body: content },
      }, { headers: { 'X-API-Key': this.apiKey, 'Content-Type': 'application/json' } });
      return data;
    } catch (error: any) {
      return { error: error.response?.data?.message || error.message };
    }
  }

  /** Send a template message */
  async sendTemplate(to: string, templateId: string, params: any[]): Promise<any> {
    try {
      const { data } = await axios.post(`${this.baseUrl}/messages`, {
        to, type: 'template', template: { id: templateId, params },
      }, { headers: { 'X-API-Key': this.apiKey, 'Content-Type': 'application/json' } });
      return data;
    } catch (error: any) {
      return { error: error.response?.data?.message || error.message };
    }
  }

  /** List available templates */
  async getTemplates(): Promise<any> {
    try {
      const { data } = await axios.get(`${this.baseUrl}/templates`, {
        headers: { 'X-API-Key': this.apiKey },
      });
      return { templates: data.data || data, count: (data.data || data).length };
    } catch (error: any) {
      return { error: error.response?.data?.message || error.message };
    }
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// Email (Gmail / IMAP)
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Email adapter using Gmail API
 * Requires GMAIL_CLIENT_ID, GMAIL_CLIENT_SECRET, GMAIL_REFRESH_TOKEN env vars
 */
export class EmailAdapter {
  private clientId: string;
  private clientSecret: string;
  private refreshToken: string;
  private accessToken = '';

  constructor() {
    this.clientId = process.env.GMAIL_CLIENT_ID || '';
    this.clientSecret = process.env.GMAIL_CLIENT_SECRET || '';
    this.refreshToken = process.env.GMAIL_REFRESH_TOKEN || '';
  }

  /** Get or refresh the OAuth access token */
  private async ensureToken(): Promise<string> {
    if (this.accessToken) return this.accessToken;
    try {
      const { data } = await axios.post('https://oauth2.googleapis.com/token', {
        client_id: this.clientId, client_secret: this.clientSecret,
        refresh_token: this.refreshToken, grant_type: 'refresh_token',
      });
      this.accessToken = data.access_token;
      return this.accessToken;
    } catch (error: any) {
      throw new Error(`Failed to get Gmail token: ${error.message}`);
    }
  }

  /** Get count of unread emails */
  async getUnreadCount(): Promise<number> {
    try {
      const token = await this.ensureToken();
      const { data } = await axios.get('https://gmail.googleapis.com/gmail/v1/users/me/messages', {
        headers: { Authorization: `Bearer ${token}` },
        params: { q: 'is:unread', maxResults: 1 },
      });
      return data.resultSizeEstimate || 0;
    } catch (error: any) {
      return 0;
    }
  }

  /** Get recent emails */
  async getRecentEmails(limit: number = 20): Promise<any> {
    try {
      const token = await this.ensureToken();
      const { data } = await axios.get('https://gmail.googleapis.com/gmail/v1/users/me/messages', {
        headers: { Authorization: `Bearer ${token}` },
        params: { maxResults: limit },
      });
      const messages = await Promise.all(
        (data.messages || []).slice(0, limit).map(async (m: any) => {
          const { data: detail } = await axios.get(
            `https://gmail.googleapis.com/gmail/v1/users/me/messages/${m.id}`,
            { headers: { Authorization: `Bearer ${token}` }, params: { format: 'metadata', metadataHeaders: ['From', 'Subject', 'Date'] } },
          );
          const headers = (detail.payload?.headers || []).reduce((acc: any, h: any) => {
            acc[h.name] = h.value; return acc;
          }, {});
          return { id: m.id, ...headers, snippet: detail.snippet };
        }),
      );
      return { messages, count: messages.length };
    } catch (error: any) {
      return { error: error.message };
    }
  }

  /** Send an email */
  async sendEmail(to: string, subject: string, body: string): Promise<any> {
    try {
      const token = await this.ensureToken();
      const encoded = Buffer.from(
        `To: ${to}\r\nSubject: ${subject}\r\nContent-Type: text/plain; charset=utf-8\r\n\r\n${body}`,
      ).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
      const { data } = await axios.post('https://gmail.googleapis.com/gmail/v1/users/me/messages/send', {
        raw: encoded,
      }, { headers: { Authorization: `Bearer ${token}` } });
      return { id: data.id, labelIds: data.labelIds };
    } catch (error: any) {
      return { error: error.message };
    }
  }

  /** Search emails */
  async search(query: string): Promise<any> {
    try {
      const token = await this.ensureToken();
      const { data } = await axios.get('https://gmail.googleapis.com/gmail/v1/users/me/messages', {
        headers: { Authorization: `Bearer ${token}` },
        params: { q: query, maxResults: 20 },
      });
      return { messages: data.messages || [], count: data.resultSizeEstimate || 0 };
    } catch (error: any) {
      return { error: error.message };
    }
  }

  /** Get all label names */
  async getLabels(): Promise<string[]> {
    try {
      const token = await this.ensureToken();
      const { data } = await axios.get('https://gmail.googleapis.com/gmail/v1/users/me/labels', {
        headers: { Authorization: `Bearer ${token}` },
      });
      return (data.labels || []).map((l: any) => l.name);
    } catch (error: any) {
      return [];
    }
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// MS Teams
// ═══════════════════════════════════════════════════════════════════════════

/**
 * MS Teams adapter using Microsoft Graph API
 * Requires MS_TEAMS_CLIENT_ID, MS_TEAMS_CLIENT_SECRET, MS_TEAMS_TENANT_ID env vars
 */
export class TeamsAdapter {
  private clientId: string;
  private clientSecret: string;
  private tenantId: string;
  private baseUrl = 'https://graph.microsoft.com/v1.0';
  private accessToken = '';

  constructor() {
    this.clientId = process.env.MS_TEAMS_CLIENT_ID || '';
    this.clientSecret = process.env.MS_TEAMS_CLIENT_SECRET || '';
    this.tenantId = process.env.MS_TEAMS_TENANT_ID || '';
  }

  /** Obtain access token via client credentials */
  private async ensureToken(): Promise<string> {
    if (this.accessToken) return this.accessToken;
    try {
      const { data } = await axios.post(
        `https://login.microsoftonline.com/${this.tenantId}/oauth2/v2.0/token`,
        new URLSearchParams({
          client_id: this.clientId, client_secret: this.clientSecret,
          scope: 'https://graph.microsoft.com/.default', grant_type: 'client_credentials',
        }).toString(),
        { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } },
      );
      this.accessToken = data.access_token;
      return this.accessToken;
    } catch (error: any) {
      throw new Error(`Failed to get Teams token: ${error.message}`);
    }
  }

  /** List joined teams */
  async getTeams(): Promise<any> {
    try {
      const token = await this.ensureToken();
      const { data } = await axios.get(`${this.baseUrl}/me/joinedTeams`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      return { teams: data.value.map((t: any) => ({ id: t.id, name: t.displayName })), count: data.value.length };
    } catch (error: any) {
      return { error: error.message };
    }
  }

  /** List channels in a team */
  async getChannels(teamId: string): Promise<any> {
    try {
      const token = await this.ensureToken();
      const { data } = await axios.get(`${this.baseUrl}/teams/${teamId}/channels`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      return { channels: data.value.map((c: any) => ({ id: c.id, name: c.displayName })), count: data.value.length };
    } catch (error: any) {
      return { error: error.message };
    }
  }

  /** Send a message to a channel */
  async sendMessage(channelId: string, content: string): Promise<any> {
    try {
      const token = await this.ensureToken();
      const { data } = await axios.post(
        `${this.baseUrl}/chats/${channelId}/messages`,
        { body: { contentType: 'text', content } },
        { headers: { Authorization: `Bearer ${token}` } },
      );
      return { id: data.id };
    } catch (error: any) {
      return { error: error.message };
    }
  }

  /** Get recent messages from a channel */
  async getMessages(channelId: string, limit: number = 50): Promise<any> {
    try {
      const token = await this.ensureToken();
      const { data } = await axios.get(`${this.baseUrl}/chats/${channelId}/messages`, {
        headers: { Authorization: `Bearer ${token}` },
        params: { $top: limit },
      });
      return { messages: data.value.map((m: any) => ({ id: m.id, content: m.body?.content, from: m.from?.user?.displayName })), count: data.value.length };
    } catch (error: any) {
      return { error: error.message };
    }
  }

  /** List members of a team */
  async listMembers(teamId: string): Promise<any> {
    try {
      const token = await this.ensureToken();
      const { data } = await axios.get(`${this.baseUrl}/teams/${teamId}/members`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      return { members: data.value.map((m: any) => ({ id: m.id, displayName: m.displayName, email: m.email, role: m.roles?.[0] })), count: data.value.length };
    } catch (error: any) {
      return { error: error.message };
    }
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// LINE
// ═══════════════════════════════════════════════════════════════════════════

/**
 * LINE Messaging API adapter
 * Requires LINE_CHANNEL_ACCESS_TOKEN env var
 */
export class LineAdapter {
  private accessToken: string;
  private baseUrl = 'https://api.line.me/v2/bot';

  constructor() {
    this.accessToken = process.env.LINE_CHANNEL_ACCESS_TOKEN || '';
  }

  /** Broadcast messages to all friends/followers */
  async broadcast(messages: any[]): Promise<any> {
    try {
      const { data } = await axios.post(`${this.baseUrl}/message/broadcast`, { messages }, {
        headers: { Authorization: `Bearer ${this.accessToken}`, 'Content-Type': 'application/json' },
      });
      return data;
    } catch (error: any) {
      return { error: error.response?.data?.message || error.message };
    }
  }

  /** Push a message to a specific user */
  async pushMessage(userId: string, message: any): Promise<any> {
    try {
      const { data } = await axios.post(`${this.baseUrl}/message/push`, { to: userId, messages: [message] }, {
        headers: { Authorization: `Bearer ${this.accessToken}`, 'Content-Type': 'application/json' },
      });
      return data;
    } catch (error: any) {
      return { error: error.response?.data?.message || error.message };
    }
  }

  /** Get a user's profile */
  async getProfile(userId: string): Promise<any> {
    try {
      const { data } = await axios.get(`${this.baseUrl}/profile/${userId}`, {
        headers: { Authorization: `Bearer ${this.accessToken}` },
      });
      return { displayName: data.displayName, userId: data.userId, pictureUrl: data.pictureUrl, statusMessage: data.statusMessage };
    } catch (error: any) {
      return { error: error.response?.data?.message || error.message };
    }
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// Mattermost
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Mattermost API adapter
 * Requires MATTERMOST_URL and MATTERMOST_TOKEN env vars
 */
export class MattermostAdapter {
  private token: string;
  private baseUrl: string;

  constructor() {
    this.token = process.env.MATTERMOST_TOKEN || '';
    this.baseUrl = (process.env.MATTERMOST_URL || 'http://localhost:8065').replace(/\/$/, '');
  }

  /** List teams the user belongs to */
  async getTeams(): Promise<any> {
    try {
      const { data } = await axios.get(`${this.baseUrl}/api/v4/teams`, {
        headers: { Authorization: `Bearer ${this.token}` },
      });
      return { teams: data.map((t: any) => ({ id: t.id, name: t.display_name, type: t.type })), count: data.length };
    } catch (error: any) {
      return { error: error.message };
    }
  }

  /** List channels in a team */
  async getChannels(teamId: string): Promise<any> {
    try {
      const { data } = await axios.get(`${this.baseUrl}/api/v4/teams/${teamId}/channels`, {
        headers: { Authorization: `Bearer ${this.token}` },
      });
      return { channels: data.map((c: any) => ({ id: c.id, name: c.display_name, type: c.type })), count: data.length };
    } catch (error: any) {
      return { error: error.message };
    }
  }

  /** Post a message to a channel */
  async postMessage(channelId: string, message: string): Promise<any> {
    try {
      const { data } = await axios.post(`${this.baseUrl}/api/v4/posts`, {
        channel_id: channelId, message,
      }, { headers: { Authorization: `Bearer ${this.token}` } });
      return { id: data.id, message: data.message, createAt: data.create_at };
    } catch (error: any) {
      return { error: error.message };
    }
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// Twilio / SMS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Twilio SMS adapter
 * Requires TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_PHONE_NUMBER env vars
 */
export class SMSAdapter {
  private accountSid: string;
  private authToken: string;
  private phoneNumber: string;
  private baseUrl: string;

  constructor() {
    this.accountSid = process.env.TWILIO_ACCOUNT_SID || '';
    this.authToken = process.env.TWILIO_AUTH_TOKEN || '';
    this.phoneNumber = process.env.TWILIO_PHONE_NUMBER || '';
    this.baseUrl = `https://api.twilio.com/2010-04-01/Accounts/${this.accountSid}`;
  }

  /** Send an SMS message */
  async send(to: string, body: string): Promise<any> {
    try {
      const { data } = await axios.post(
        `${this.baseUrl}/Messages.json`,
        new URLSearchParams({ From: this.phoneNumber, To: to, Body: body }).toString(),
        {
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          auth: { username: this.accountSid, password: this.authToken },
        },
      );
      return { sid: data.sid, status: data.status, to: data.to };
    } catch (error: any) {
      return { error: error.response?.data?.message || error.message };
    }
  }

  /** List recent messages */
  async getList(): Promise<any> {
    try {
      const { data } = await axios.get(`${this.baseUrl}/Messages.json`, {
        auth: { username: this.accountSid, password: this.authToken },
        params: { PageSize: 20 },
      });
      return { messages: data.messages_list?.map((m: any) => ({ sid: m.sid, from: m.from, to: m.to, body: m.body, status: m.status })) || [], count: data.messages_list?.length || 0 };
    } catch (error: any) {
      return { error: error.message };
    }
  }

  /** Get status of a sent message */
  async getStatus(messageId: string): Promise<any> {
    try {
      const { data } = await axios.get(`${this.baseUrl}/Messages/${messageId}.json`, {
        auth: { username: this.accountSid, password: this.authToken },
      });
      return { sid: data.sid, status: data.status, to: data.to, body: data.body };
    } catch (error: any) {
      return { error: error.message };
    }
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// Google Calendar
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Google Calendar API adapter
 * Requires GOOGLE_CALENDAR_CLIENT_ID, GOOGLE_CALENDAR_CLIENT_SECRET,
 * GOOGLE_CALENDAR_REFRESH_TOKEN env vars
 */
export class GoogleCalendarAdapter {
  private clientId: string;
  private clientSecret: string;
  private refreshToken: string;
  private accessToken = '';

  constructor() {
    this.clientId = process.env.GOOGLE_CALENDAR_CLIENT_ID || process.env.GMAIL_CLIENT_ID || '';
    this.clientSecret = process.env.GOOGLE_CALENDAR_CLIENT_SECRET || process.env.GMAIL_CLIENT_SECRET || '';
    this.refreshToken = process.env.GOOGLE_CALENDAR_REFRESH_TOKEN || process.env.GMAIL_REFRESH_TOKEN || '';
  }

  /** Get or refresh the OAuth access token */
  private async ensureToken(): Promise<string> {
    if (this.accessToken) return this.accessToken;
    try {
      const { data } = await axios.post('https://oauth2.googleapis.com/token', {
        client_id: this.clientId, client_secret: this.clientSecret,
        refresh_token: this.refreshToken, grant_type: 'refresh_token',
      });
      this.accessToken = data.access_token;
      return this.accessToken;
    } catch (error: any) {
      throw new Error(`Failed to get Calendar token: ${error.message}`);
    }
  }

  /** List events from a calendar */
  async listEvents(calendarId: string = 'primary', timeMin?: string, timeMax?: string): Promise<any> {
    try {
      const token = await this.ensureToken();
      const params: any = { maxResults: 50, singleEvents: true, orderBy: 'startTime' };
      if (timeMin) params.timeMin = timeMin;
      if (timeMax) params.timeMax = timeMax;
      const { data } = await axios.get(`https://www.googleapis.com/calendar/v3/calendars/${calendarId}/events`, {
        headers: { Authorization: `Bearer ${token}` }, params,
      });
      return { events: (data.items || []).map((e: any) => ({ id: e.id, summary: e.summary, start: e.start, end: e.end, location: e.location })), count: data.items?.length || 0 };
    } catch (error: any) {
      return { error: error.message };
    }
  }

  /** Create a new event */
  async createEvent(calendarId: string = 'primary', event?: any): Promise<any> {
    try {
      const token = await this.ensureToken();
      const { data } = await axios.post(
        `https://www.googleapis.com/calendar/v3/calendars/${calendarId}/events`,
        event,
        { headers: { Authorization: `Bearer ${token}` } },
      );
      return { id: data.id, summary: data.summary, htmlLink: data.htmlLink };
    } catch (error: any) {
      return { error: error.message };
    }
  }

  /** Update an existing event */
  async updateEvent(calendarId: string, eventId: string, event: any): Promise<any> {
    try {
      const token = await this.ensureToken();
      const { data } = await axios.put(
        `https://www.googleapis.com/calendar/v3/calendars/${calendarId}/events/${eventId}`,
        event,
        { headers: { Authorization: `Bearer ${token}` } },
      );
      return { id: data.id, summary: data.summary, updated: data.updated };
    } catch (error: any) {
      return { error: error.message };
    }
  }

  /** Delete an event */
  async deleteEvent(calendarId: string, eventId: string): Promise<void> {
    try {
      const token = await this.ensureToken();
      await axios.delete(
        `https://www.googleapis.com/calendar/v3/calendars/${calendarId}/events/${eventId}`,
        { headers: { Authorization: `Bearer ${token}` } },
      );
    } catch (error: any) {
      throw new Error(`Failed to delete event: ${error.message}`);
    }
  }

  /** Get free/busy information for calendars */
  async getFreeBusy(calendarIds: string[], timeMin: string, timeMax: string): Promise<any> {
    try {
      const token = await this.ensureToken();
      const { data } = await axios.post(
        'https://www.googleapis.com/calendar/v3/freeBusy',
        { timeMin, timeMax, items: calendarIds.map(id => ({ id })) },
        { headers: { Authorization: `Bearer ${token}` } },
      );
      return data;
    } catch (error: any) {
      return { error: error.message };
    }
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// Ntfy (Push Notifications)
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Ntfy push notification adapter
 * Server defaults to https://ntfy.sh
 */
export class NtfyAdapter {
  private serverUrl: string;

  constructor(serverUrl?: string) {
    this.serverUrl = (serverUrl || process.env.NTFY_SERVER_URL || 'https://ntfy.sh').replace(/\/$/, '');
  }

  /** Send a push notification to a topic */
  async send(topic: string, message: string, title?: string, priority?: number): Promise<void> {
    try {
      const headers: Record<string, string> = {};
      if (title) headers['Title'] = title;
      if (priority !== undefined) headers['Priority'] = String(priority);
      headers['Content-Type'] = 'text/plain';

      await axios.post(`${this.serverUrl}/${topic}`, message, { headers });
    } catch (error: any) {
      throw new Error(`Failed to send ntfy notification: ${error.message}`);
    }
  }

  /** Subscribe to a topic and return recent messages */
  async subscribe(topic: string): Promise<any> {
    try {
      const { data } = await axios.get(`${this.serverUrl}/${topic}/json`, {
        params: { since: '1h', limit: 20 },
      });
      const messages = Array.isArray(data) ? data : [data];
      return { messages: messages.map((m: any) => ({ id: m.id, topic: m.topic, title: m.title, message: m.message, time: m.time })), count: messages.length };
    } catch (error: any) {
      return { error: error.message };
    }
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// Bluesky
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Bluesky (AT Protocol) adapter
 * Requires BLUESKY_IDENTIFIER and BLUESKY_APP_PASSWORD env vars
 */
export class BlueskyAdapter {
  private identifier: string;
  private password: string;
  private baseUrl = 'https://bsky.social/xrpc';
  private accessToken = '';
  private did = '';

  constructor() {
    this.identifier = process.env.BLUESKY_IDENTIFIER || '';
    this.password = process.env.BLUESKY_APP_PASSWORD || '';
  }

  /** Authenticate and get session */
  private async ensureAuth(): Promise<void> {
    if (this.accessToken) return;
    try {
      const { data } = await axios.post(`${this.baseUrl}/com.atproto.server.createSession`, {
        identifier: this.identifier, password: this.password,
      });
      this.accessToken = data.accessJwt;
      this.did = data.did;
    } catch (error: any) {
      throw new Error(`Bluesky auth failed: ${error.message}`);
    }
  }

  /** Get the authenticated user's timeline */
  async getTimeline(limit: number = 20): Promise<any> {
    try {
      await this.ensureAuth();
      const { data } = await axios.get(`${this.baseUrl}/app.bsky.feed.getTimeline`, {
        headers: { Authorization: `Bearer ${this.accessToken}` },
        params: { limit },
      });
      return { feed: data.feed.map((p: any) => ({ cid: p.post.cid, text: p.post.record?.text, author: p.post.author?.handle, createdAt: p.post.record?.createdAt })), count: data.feed.length };
    } catch (error: any) {
      return { error: error.message };
    }
  }

  /** Post a new skeet */
  async post(text: string): Promise<any> {
    try {
      await this.ensureAuth();
      const { data } = await axios.post(`${this.baseUrl}/com.atproto.repo.createRecord`, {
        repo: this.did,
        collection: 'app.bsky.feed.post',
        record: { $type: 'app.bsky.feed.post', text, createdAt: new Date().toISOString() },
      }, { headers: { Authorization: `Bearer ${this.accessToken}` } });
      return { uri: data.uri, cid: data.cid };
    } catch (error: any) {
      return { error: error.message };
    }
  }

  /** Get a user's profile */
  async getProfile(actor: string): Promise<any> {
    try {
      const { data } = await axios.get(`${this.baseUrl}/app.bsky.actor.getProfile`, {
        params: { actor },
      });
      return { did: data.did, handle: data.handle, displayName: data.displayName, description: data.description, followersCount: data.followersCount, followsCount: data.followsCount, postsCount: data.postsCount };
    } catch (error: any) {
      return { error: error.message };
    }
  }

  /** Search actors and posts */
  async search(query: string): Promise<any> {
    try {
      const { data } = await axios.get(`${this.baseUrl}/app.bsky.actor.searchActors`, {
        params: { q: query, limit: 20 },
      });
      return { actors: (data.actors || []).map((a: any) => ({ did: a.did, handle: a.handle, displayName: a.displayName })), count: data.actors?.length || 0 };
    } catch (error: any) {
      return { error: error.message };
    }
  }
}
