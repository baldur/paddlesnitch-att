export async function sendEmail(to: string, subject: string, text: string): Promise<void> {
  if (process.env.USE_LOCAL_STORAGE === 'true' || process.env.NODE_ENV !== 'production') {
    console.log(`\n  EMAIL\n  To: ${to}\n  Subject: ${subject}\n\n${text}\n`)
    return
  }
  const { SESClient, SendEmailCommand } = await import('@aws-sdk/client-ses')
  const ses = new SESClient({ region: process.env.AWS_REGION ?? 'eu-west-1' })
  await ses.send(new SendEmailCommand({
    Source: 'noreply@paddlesnitch.com',
    Destination: { ToAddresses: [to] },
    Message: {
      Subject: { Data: subject },
      Body: { Text: { Data: text } },
    },
  }))
}
