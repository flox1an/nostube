import { BlossomClient, Signer } from "blossom-client-sdk";

export interface UploadFileWithProgressProps {
  file: File;
  server: string;
  signer: Signer;
}

export async function uploadFileToMultipleServers({
  file,
  servers,
  signer,
}: {
  file: File;
  servers: string[];
  signer: Signer;
}): Promise<string[]> {
  const results = await Promise.allSettled(
    servers.map(async (server) => {
      const uploadAuth = await BlossomClient.createUploadAuth(signer, file);
      const blob = await BlossomClient.uploadBlob(server, file, {
        auth: uploadAuth,
      });
      return blob.url;
    })
  );
  return results
    .filter((r): r is PromiseFulfilledResult<string> => r.status === 'fulfilled')
    .map((r) => r.value);
}
