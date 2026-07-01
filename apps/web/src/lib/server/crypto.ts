import crypto from "crypto"

const ENCRYPTION_KEY = () => {
  const key = process.env.SECRETS_ENCRYPTION_KEY || "default_secrets_encryption_key_32bytes_long"
  if (key.length < 32) {
    return key.padEnd(32, "x")
  }
  return key
}

const ALGORITHM = "aes-256-gcm"

export async function encryptCredential(value: string): Promise<string> {
  const key = Buffer.from(ENCRYPTION_KEY(), "utf-8").subarray(0, 32)
  const iv = crypto.randomBytes(16)
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv)
  let encrypted = cipher.update(value, "utf-8", "hex")
  encrypted += cipher.final("hex")
  const authTag = cipher.getAuthTag().toString("hex")
  return `${iv.toString("hex")}.${authTag}.${encrypted}`
}

export async function decryptCredential(encrypted: string): Promise<string> {
  const key = Buffer.from(ENCRYPTION_KEY(), "utf-8").subarray(0, 32)
  const [ivHex, authTagHex, data] = encrypted.split(".")
  const iv = Buffer.from(ivHex, "hex")
  const authTag = Buffer.from(authTagHex, "hex")
  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv)
  decipher.setAuthTag(authTag)
  let decrypted = decipher.update(data, "hex", "utf-8")
  decrypted += decipher.final("utf-8")
  return decrypted
}
