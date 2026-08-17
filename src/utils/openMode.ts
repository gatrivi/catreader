export function shouldOpenTextFirst(fileType: string, explicitPreference?: boolean): boolean {
  return fileType.toLowerCase() === 'pdf' && explicitPreference !== false;
}
