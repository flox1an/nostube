export default function handler(_req: any, res: any) {
  res.status(200).json({ hello: 'world', ts: Date.now() })
}
