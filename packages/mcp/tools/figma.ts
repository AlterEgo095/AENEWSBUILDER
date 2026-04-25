/**
 * Figma MCP Tool
 * Extracts designs from Figma files and converts them to code
 */

import axios from 'axios';

export interface FigmaTool {
  name: 'figma';
  permissions: ['network', 'read'];
  execute: (params: FigmaParams) => Promise<FigmaResult>;
}

export interface FigmaParams {
  fileKey: string;
  nodeId?: string;
  format?: 'svg' | 'png' | 'jpg';
  scale?: number;
}

export interface FigmaResult {
  success: boolean;
  data?: {
    name: string;
    type: string;
    styles: Record<string, any>;
    children?: any[];
    imageUrl?: string;
    code?: string;
  };
  error?: string;
}

class FigmaAdapter {
  private apiKey: string;
  private baseUrl = 'https://api.figma.com/v1';

  constructor(apiKey: string) {
    this.apiKey = apiKey;
  }

  /**
   * Execute Figma extraction
   */
  async execute(params: FigmaParams): Promise<FigmaResult> {
    try {
      // 1. Fetch file metadata
      const fileData = await this.fetchFile(params.fileKey);

      if (!fileData) {
        return {
          success: false,
          error: 'Failed to fetch Figma file',
        };
      }

      // 2. Get specific node or entire document
      const targetNode = params.nodeId
        ? this.findNode(fileData.document, params.nodeId)
        : fileData.document;

      if (!targetNode) {
        return {
          success: false,
          error: `Node ${params.nodeId} not found`,
        };
      }

      // 3. Extract image if requested
      let imageUrl: string | undefined;
      if (params.format) {
        imageUrl = await this.renderImage(
          params.fileKey,
          params.nodeId || fileData.document.id,
          params.format,
          params.scale || 2
        );
      }

      // 4. Extract styles and generate code
      const styles = this.extractStyles(targetNode);
      const code = this.generateCode(targetNode, styles);

      return {
        success: true,
        data: {
          name: targetNode.name,
          type: targetNode.type,
          styles,
          children: targetNode.children,
          imageUrl,
          code,
        },
      };
    } catch (error: any) {
      return {
        success: false,
        error: error.message || 'Unknown error',
      };
    }
  }

  /**
   * Fetch Figma file
   */
  private async fetchFile(fileKey: string) {
    const response = await axios.get(`${this.baseUrl}/files/${fileKey}`, {
      headers: {
        'X-Figma-Token': this.apiKey,
      },
    });
    return response.data;
  }

  /**
   * Find node by ID
   */
  private findNode(node: any, targetId: string): any {
    if (node.id === targetId) return node;
    if (!node.children) return null;

    for (const child of node.children) {
      const found = this.findNode(child, targetId);
      if (found) return found;
    }
    return null;
  }

  /**
   * Render node as image
   */
  private async renderImage(
    fileKey: string,
    nodeId: string,
    format: string,
    scale: number
  ): Promise<string> {
    const response = await axios.get(`${this.baseUrl}/images/${fileKey}`, {
      headers: {
        'X-Figma-Token': this.apiKey,
      },
      params: {
        ids: nodeId,
        format,
        scale,
      },
    });

    return response.data.images[nodeId];
  }

  /**
   * Extract styles from node
   */
  private extractStyles(node: any): Record<string, any> {
    const styles: Record<string, any> = {};

    // Layout
    if (node.absoluteBoundingBox) {
      styles.width = node.absoluteBoundingBox.width;
      styles.height = node.absoluteBoundingBox.height;
    }

    // Background
    if (node.fills && node.fills[0]) {
      const fill = node.fills[0];
      if (fill.type === 'SOLID') {
        styles.backgroundColor = this.rgbaToHex(fill.color, fill.opacity);
      }
    }

    // Border
    if (node.strokes && node.strokes[0]) {
      const stroke = node.strokes[0];
      styles.borderWidth = node.strokeWeight || 1;
      styles.borderColor = this.rgbaToHex(stroke.color, stroke.opacity);
    }

    // Border radius
    if (node.cornerRadius) {
      styles.borderRadius = node.cornerRadius;
    }

    // Text styles
    if (node.type === 'TEXT' && node.style) {
      styles.fontSize = node.style.fontSize;
      styles.fontFamily = node.style.fontFamily;
      styles.fontWeight = node.style.fontWeight;
      styles.lineHeight = node.style.lineHeightPx;
    }

    return styles;
  }

  /**
   * Generate code from node
   */
  private generateCode(node: any, styles: Record<string, any>): string {
    const cssStyles = Object.entries(styles)
      .map(([key, value]) => {
        const cssKey = key.replace(/([A-Z])/g, '-$1').toLowerCase();
        return `  ${cssKey}: ${value}${typeof value === 'number' && key !== 'fontWeight' ? 'px' : ''};`;
      })
      .join('\n');

    return `
/* ${node.name} */
.${this.toKebabCase(node.name)} {
${cssStyles}
}`;
  }

  /**
   * Convert RGBA to HEX
   */
  private rgbaToHex(color: any, opacity: number = 1): string {
    const r = Math.round(color.r * 255);
    const g = Math.round(color.g * 255);
    const b = Math.round(color.b * 255);
    const a = Math.round(opacity * 255);

    return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}${a < 255 ? a.toString(16).padStart(2, '0') : ''}`;
  }

  /**
   * Convert to kebab-case
   */
  private toKebabCase(str: string): string {
    return str
      .replace(/([a-z])([A-Z])/g, '$1-$2')
      .replace(/\s+/g, '-')
      .toLowerCase();
  }
}

export default FigmaAdapter;
