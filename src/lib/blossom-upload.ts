import {
  BlobDescriptor,
  BlossomClient,
  Signer,
} from "blossom-client-sdk";

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
}): Promise<BlobDescriptor[]> {
  const results = await Promise.allSettled(
    servers.map(async (server) => {
      const uploadAuth = await BlossomClient.createUploadAuth(signer, file);
      const blob = await BlossomClient.uploadBlob(server, file, {
        auth: uploadAuth,
      });
      return blob;
    })
  );
  return results
    .filter(
      (r): r is PromiseFulfilledResult<BlobDescriptor> =>
        r.status === "fulfilled"
    )
    .map((r) => r.value);
}

export async function mirrorBlobsToServers({
  mirrorServers,
  blob,
  signer,
}: {
  mirrorServers: string[];
  blob: BlobDescriptor;
  signer: Signer;
}): Promise<BlobDescriptor[]> {
  console.log("Mirroring blobs to servers", mirrorServers, blob);
  const auth = await BlossomClient.createUploadAuth(signer, blob.sha256);
  const results = await Promise.allSettled(
        mirrorServers.map(async (server) => {
          return await BlossomClient.mirrorBlob(server, blob, { auth });
        })
      );


  return results
    .filter(
      (r): r is PromiseFulfilledResult<BlobDescriptor> =>
        r.status === "fulfilled"
    )
    .map((r) => r.value);
}
