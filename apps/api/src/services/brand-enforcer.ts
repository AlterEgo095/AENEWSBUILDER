/**
 * Brand Name Enforcer — Post-processing approach
 * After AI generates code, we REPLACE any generic brand names
 * with the actual brand name from the user's prompt.
 */

const GENERIC_BRAND_PATTERNS = [
  'BrandName', 'Brand Name', 'YourBrand', 'Your Brand', 'YourBrandName',
  'AppName', 'App Name', 'YourApp', 'Your App', 'ProjectName', 'Project Name',
  'CompanyName', 'Company Name', 'YourCompany', 'Your Company',
  'Nexus', 'NexusApp', 'Nexus Landing', 'Nexus Dashboard', 'Nexus Store',
  'MyApp', 'My App', 'MyBrand', 'My Brand', 'MyCompany',
  'ProductName', 'Product Name', 'SiteName', 'Site Name',
];

export function extractBrandName(prompt: string, projectName?: string): string {
  // Try various patterns
  const patterns = [
    /(?:appel[ée]e?|called|named|nommé\s+e?|nom\s+|nommé)\s+["']?([A-Z][a-zA-Z0-9]+(?:\s[A-Z][a-zA-Z0-9]+)?)["']?/i,
    /(?:pour\s+(?:une\s+)?(?:app|application|startup|plateforme|solution|outil|site)\s+(?:IA\s+)?(?:appelée?\s+)?)["']?([A-Z][a-zA-Z0-9]+(?:\s[A-Z][a-zA-Z0-9]+)?)["']?/i,
    /(?:called|named)\s+["']([A-Z][a-zA-Z0-9]+(?:\s[A-Z][a-zA-Z0-9]+)?)["']/i,
  ];

  for (const pattern of patterns) {
    const match = prompt.match(pattern);
    if (match) return match[1].trim();
  }

  return projectName || 'App';
}

export function enforceBrandInCode(code: string, brandName: string): string {
  let result = code;

  for (const generic of GENERIC_BRAND_PATTERNS) {
    // Replace in text content, titles, headings — but NOT in CSS class names or JS variables
    // Replace in HTML text nodes, title tags, heading content
    const escapedGeneric = generic.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    
    // Replace in <title> tags
    result = result.replace(
      new RegExp(`(<title[^>]*>)\\s*${escapedGeneric}\\s*(</title>)`, 'gi'),
      `$1${brandName}$2`
    );
    
    // Replace in heading tags content
    result = result.replace(
      new RegExp(`(<h[1-6][^>]*>)\\s*${escapedGeneric}\\s*(</h[1-6]>)`, 'gi'),
      `$1${brandName}$2`
    );
    
    // Replace in placeholder/alt text
    result = result.replace(
      new RegExp(`(alt=["'])${escapedGeneric}(["'])`, 'gi'),
      `$1${brandName}$2`
    );
    
    // Replace in visible text (between tags) — careful not to break attributes
    result = result.replace(
      new RegExp(`(>)\\s*${escapedGeneric}\\s*(<)`, 'gi'),
      `$1${brandName}$2`
    );
    
    // Replace in JavaScript string literals
    result = result.replace(
      new RegExp(`(['"\x60])${escapedGeneric}\\1`, 'g'),
      `$1${brandName}$1`
    );

    // Replace in CSS content property
    result = result.replace(
      new RegExp(`(content:\\s*["'])${escapedGeneric}(["'])`, 'gi'),
      `$1${brandName}$2`
    );
  }

  return result;
}

export function enforceDarkTheme(htmlContent: string, prompt: string): string {
  // Detect if user requested dark theme
  const darkKeywords = /thème\s+sombre|dark\s+theme|dark\s+mode|thème\s+foncé|mode\s+sombre|mode\s+foncé/i;
  const lightKeywords = /thème\s+clair|light\s+theme|light\s+mode|thème\s+blanc|white\s+theme/i;

  const wantsDark = darkKeywords.test(prompt) && !lightKeywords.test(prompt);

  if (!wantsDark) return htmlContent;

  // Force dark theme
  let result = htmlContent;
  
  // Replace theme-light with theme-dark in body class
  result = result.replace(/class="([^"]*?)theme-light([^"]*?)"/gi, 'class="$1theme-dark$2"');
  result = result.replace(/class="([^"]*?)light-theme([^"]*?)"/gi, 'class="$1dark-theme$2"');
  
  // Add data-theme="dark" if not present
  if (!result.includes('data-theme=') && result.includes('<body')) {
    result = result.replace('<body', '<body data-theme="dark"');
  }
  
  // Force dark background if body has light background
  result = result.replace(
    /(<body[^>]*style=["'])([^"']*)(["'])/gi,
    (match, prefix, styles, suffix) => {
      const darkened = styles.replace(/background-color\s*:\s*#[fF]{3,6}/, 'background-color: #121212')
                            .replace(/background\s*:\s*#[fF]{3,6}/, 'background: #121212');
      return `${prefix}${darkened}${suffix}`;
    }
  );

  return result;
}
