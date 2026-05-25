export async function sendEmail(to: string, subject: string, text: string): Promise<void> {
  // Dev: log to console
  if (process.env.USE_LOCAL_STORAGE === 'true' || process.env.NODE_ENV !== 'production') {
    console.log(`\n  EMAIL\n  To: ${to}\n  Subject: ${subject}\n\n${text}\n`)
    return
  }
  // TODO: AWS SES for production
}
