/**
 * Slack MCP Tool
 * Send messages, list channels, fetch history, and upload files
 *
 * Based on korotovsky/slack-mcp-server
 * Requires SLACK_BOT_TOKEN env var
 */

import axios from 'axios';
import FormData from 'form-data';

export interface SlackTool {
  name: 'slack';
  permissions: ['network', 'read', 'write'];
  execute: (params: SlackParams) => Promise<SlackResult>;
}

export interface SlackParams {
  action: 'sendMessage' | 'getChannels' | 'getHistory' | 'uploadFile';
  channel?: string;
  text?: string;
  limit?: number;
  filePath?: string;
  comment?: string;
}

export interface SlackResult {
  success: boolean;
  data?: Record<string, any>;
  error?: string;
}

class SlackAdapter {
  private botToken: string;
  private baseUrl = 'https://slack.com/api';

  constructor(botToken?: string) {
    this.botToken = botToken || process.env.SLACK_BOT_TOKEN || '';
  }

  /**
   * Execute a Slack action
   */
  async execute(params: SlackParams): Promise<SlackResult> {
    try {
      switch (params.action) {
        case 'sendMessage':
          return await this.sendMessage(params.channel!, params.text!);
        case 'getChannels':
          return await this.getChannels();
        case 'getHistory':
          return await this.getHistory(params.channel!, params.limit);
        case 'uploadFile':
          return await this.uploadFile(params.channel!, params.filePath!, params.comment);
        default:
          return { success: false, error: `Unknown action: ${params.action}` };
      }
    } catch (error: any) {
      return {
        success: false,
        error: error.response?.data?.error || error.message || 'Unknown error',
      };
    }
  }

  /**
   * Send a message to a channel
   */
  async sendMessage(channel: string, text: string): Promise<SlackResult> {
    if (!channel || !text) {
      return { success: false, error: 'channel and text are required' };
    }

    const response = await axios.post(
      `${this.baseUrl}/chat.postMessage`,
      {
        channel,
        text,
        as_user: true,
      },
      { headers: this.getHeaders() }
    );

    const { ok, error: slackError, ...data } = response.data;

    if (!ok) {
      return { success: false, error: slackError || 'Slack API error' };
    }

    return {
      success: true,
      data: {
        channel: data.channel,
        timestamp: data.ts,
        message: data.message,
      },
    };
  }

  /**
   * List all channels the bot has access to
   */
  async getChannels(): Promise<SlackResult> {
    const response = await axios.get(`${this.baseUrl}/conversations.list`, {
      headers: this.getHeaders(),
      params: {
        types: 'public_channel,private_channel',
        limit: 200,
      },
    });

    const { ok, error: slackError, channels } = response.data;

    if (!ok) {
      return { success: false, error: slackError || 'Slack API error' };
    }

    const channelList = (channels || []).map((ch: any) => ({
      id: ch.id,
      name: ch.name,
      isPrivate: ch.is_private,
      memberCount: ch.num_members,
      topic: ch.topic?.value,
      purpose: ch.purpose?.value,
      created: ch.created,
    }));

    return {
      success: true,
      data: { channels: channelList, count: channelList.length },
    };
  }

  /**
   * Get message history for a channel
   */
  async getHistory(channel: string, limit: number = 50): Promise<SlackResult> {
    if (!channel) {
      return { success: false, error: 'channel is required' };
    }

    const response = await axios.get(`${this.baseUrl}/conversations.history`, {
      headers: this.getHeaders(),
      params: {
        channel,
        limit: Math.min(limit, 200),
      },
    });

    const { ok, error: slackError, messages, has_more } = response.data;

    if (!ok) {
      return { success: false, error: slackError || 'Slack API error' };
    }

    const history = (messages || []).map((msg: any) => ({
      text: msg.text,
      user: msg.user,
      botId: msg.bot_id,
      timestamp: msg.ts,
      type: msg.type,
      subtype: msg.subtype,
      attachments: msg.attachments,
      reactions: msg.reactions,
    }));

    return {
      success: true,
      data: {
        channel,
        messages: history,
        hasMore: has_more,
        count: history.length,
      },
    };
  }

  /**
   * Upload a file to a channel
   */
  async uploadFile(channel: string, filePath: string, comment?: string): Promise<SlackResult> {
    if (!channel || !filePath) {
      return { success: false, error: 'channel and filePath are required' };
    }

    const formData = new FormData();
    formData.append('channels', channel);
    formData.append('file', require('fs').createReadStream(filePath));
    if (comment) {
      formData.append('initial_comment', comment);
    }

    const response = await axios.post(`${this.baseUrl}/files.uploadV2`, formData, {
      headers: {
        ...this.getHeaders(),
        ...formData.getHeaders(),
      },
    });

    const { ok, error: slackError, files } = response.data;

    if (!ok) {
      return { success: false, error: slackError || 'Slack API error' };
    }

    const uploaded = (files || []).map((f: any) => ({
      id: f.id,
      name: f.name,
      url: f.url_private,
      mimetype: f.mimetype,
      size: f.size,
    }));

    return {
      success: true,
      data: { files: uploaded },
    };
  }

  /**
   * Build request headers with auth
   */
  private getHeaders(): Record<string, string> {
    return {
      Authorization: `Bearer ${this.botToken}`,
      'Content-Type': 'application/json',
    };
  }
}

export default SlackAdapter;
