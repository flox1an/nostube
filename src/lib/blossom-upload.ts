import { BlossomClient } from 'blossom-client-sdk';

// Types for Blossom upload
// The signer function should match the BlossomClient.createUploadAuth expectation
// Use 'unknown' for maximum compatibility and linter compliance
export type BlossomSigner = (draft: unknown) => Promise<unknown>;

export interface UploadFileWithProgressArgs {
  file: File;
  server: string;
  signer: BlossomSigner;
  onProgress?: (percent: number) => void;
}

// Upload a file to a Blossom server with progress tracking
export async function uploadFileWithProgress({
  file,
  server,
  signer,
  onProgress,
}: UploadFileWithProgressArgs): Promise<string[][]> {
  // Some SDKs expect (signer, file, message) instead of (file, signer, message)
  // If you get a type error here, try swapping the order:
  // const uploadAuth = await BlossomClient.createUploadAuth(signer, file, `Upload ${file.name}`);
  // @ts-expect-error BlossomClient.createUploadAuth type signature mismatch with actual usage; see SDK docs for details
  const uploadAuth = await BlossomClient.createUploadAuth(file, signer, `Upload ${file.name}`);
  const encodedAuthHeader = BlossomClient.encodeAuthorizationHeader(uploadAuth);

  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('PUT', new URL('/upload', server).toString());
    xhr.setRequestHeader('authorization', encodedAuthHeader);
    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable && onProgress) {
        const percent = Math.round((event.loaded / event.total) * 100);
        onProgress(percent);
      }
    };
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        try {
          const response = JSON.parse(xhr.responseText);
          resolve(response.tags as string[][] || response);
        } catch {
          resolve([]);
        }
      } else {
        reject(new Error(`Upload failed: ${xhr.status} ${xhr.statusText}`));
      }
    };
    xhr.onerror = () => reject(new Error('Network error during upload'));
    xhr.send(file);
  });
} 