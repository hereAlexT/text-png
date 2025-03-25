import { createCanvas, registerFont } from 'canvas';
import { NextRequest, NextResponse } from 'next/server';
import path from 'path';
import fs from 'fs';

// Map of supported fonts and their file paths
const SUPPORTED_FONTS = {
  'Roboto': {
    regular: '/fonts/Roboto/Roboto-VariableFont_wdth,wght.ttf',
    bold: '/fonts/Roboto/Roboto-VariableFont_wdth,wght.ttf',
  },
  'Roboto-Italic': '/fonts/Roboto/Roboto-Italic-VariableFont_wdth,wght.ttf',
  'Patua One': '/fonts/Patua_One/PatuaOne-Regular.ttf',
  'Suisse': {
    regular: '/fonts/Suisse/suisse-intl-regular.ttf',
    bold: '/fonts/Suisse/suisse-intl-bold.ttf',
  }
} as const;

type SupportedFont = keyof typeof SUPPORTED_FONTS;

// Cache for registered fonts
const registeredFonts = new Set<string>();

interface FontRegistration {
  family: string;
  weight?: string;
}

function registerLocalFont(fontFamily: string, isBold: boolean = false): string {
  const cacheKey = `${fontFamily}${isBold ? '-bold' : ''}`;
  if (registeredFonts.has(cacheKey)) {
    return isBold ? `${fontFamily}-bold` : fontFamily;
  }

  const fontConfig = SUPPORTED_FONTS[fontFamily as SupportedFont];
  if (!fontConfig) {
    throw new Error(`Font "${fontFamily}" is not supported. Supported fonts are: ${Object.keys(SUPPORTED_FONTS).join(', ')}`);
  }

  const fontPath = typeof fontConfig === 'string' 
    ? fontConfig 
    : (isBold ? fontConfig.bold : fontConfig.regular);

  const absoluteFontPath = path.join(process.cwd(), 'public', fontPath);
  
  if (!fs.existsSync(absoluteFontPath)) {
    throw new Error(`Font file not found: ${absoluteFontPath}`);
  }

  // For Suisse and other non-variable fonts, register bold as a separate font family
  const registration: FontRegistration = { 
    family: isBold ? `${fontFamily}-bold` : fontFamily
  };

  registerFont(absoluteFontPath, registration);
  registeredFonts.add(cacheKey);
  return registration.family;
}

interface TextSegment {
  text: string;
  isBold: boolean;
}

function parseText(text: string): TextSegment[] {
  const segments: TextSegment[] = [];
  const parts = text.split(/__/);
  
  parts.forEach((part, index) => {
    if (part.length > 0) {
      segments.push({
        text: part,
        isBold: index % 2 === 1
      });
    }
  });

  return segments;
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    
    // Get parameters with defaults
    const text = searchParams.get('text') || 'Hello World';
    const fontFamily = searchParams.get('font') || 'Suisse';
    const fontSize = parseInt(searchParams.get('font_size') || '24', 10);
    const backgroundColor = searchParams.get('background_color') || 'transparent';
    const scale = parseInt(searchParams.get('scale') || '2', 10);

    // Register both regular and bold variants of the font
    const regularFontFamily = registerLocalFont(fontFamily, false);
    const boldFontFamily = registerLocalFont(fontFamily, true);

    // Create high-resolution canvas
    const canvas = createCanvas(1, 1);
    const ctx = canvas.getContext('2d');

    // Set high-resolution scale
    const scaledFontSize = fontSize * scale;
    
    // Parse text into segments
    const segments = parseText(text);

    // Measure total width
    let totalWidth = 0;
    segments.forEach(segment => {
      const fontName = segment.isBold ? boldFontFamily : regularFontFamily;
      ctx.font = `${scaledFontSize}px "${fontName}"`;
      const metrics = ctx.measureText(segment.text);
      totalWidth += metrics.width;
    });
    
    // Calculate canvas size with smaller padding
    const basePadding = 8;
    const padding = basePadding * scale;
    const width = Math.ceil(totalWidth + padding * 2);
    const height = Math.ceil(scaledFontSize + padding * 2);

    // Resize canvas to final dimensions
    canvas.width = width;
    canvas.height = height;

    // Clear and set background
    ctx.clearRect(0, 0, width, height);
    if (backgroundColor !== 'transparent') {
      ctx.fillStyle = backgroundColor;
      ctx.fillRect(0, 0, width, height);
    }

    // Draw text segments
    let currentX = padding;
    segments.forEach(segment => {
      const fontName = segment.isBold ? boldFontFamily : regularFontFamily;
      ctx.font = `${scaledFontSize}px "${fontName}"`;
      ctx.fillStyle = 'black';
      ctx.textBaseline = 'middle';
      ctx.fillText(segment.text, currentX, height / 2);
      currentX += ctx.measureText(segment.text).width;
    });

    // Convert to PNG buffer
    const buffer = canvas.toBuffer('image/png');

    // Return the PNG image
    return new NextResponse(buffer, {
      headers: {
        'Content-Type': 'image/png',
        'Cache-Control': 'public, max-age=31536000',
      },
    });

  } catch (error) {
    console.error('Error generating PNG:', error);
    return NextResponse.json(
      { error: 'Failed to generate image' },
      { status: 500 }
    );
  }
} 