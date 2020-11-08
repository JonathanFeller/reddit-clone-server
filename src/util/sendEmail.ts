import nodemailer from "nodemailer";

// async..await is not allowed in global scope, must use a wrapper
export async function sendEmail(to: string, html: string) {
  // Generate test SMTP service account from ethereal.email
  // Only needed if you don't have a real mail account for testing
  let testAccount = await nodemailer.createTestAccount();
  console.log(testAccount);

  // create reusable transporter object using the default SMTP transport
  let transporter = nodemailer.createTransport({
    host: "smtp.ethereal.email",
    port: 587,
    secure: false, // true for 465, false for other ports
    auth: {
      user: "bkn5jbbeeqoni6im@ethereal.email", // generated ethereal user
      pass: "2gCu8MzaC5A46s6p6c", // generated ethereal password
    },
  });

  let info = await transporter.sendMail({
    subject: "Change password",
    from: '"Fred Foo 👻" <foo@example.com>',
    to,
    html,
  });

  console.log("Message sent: %s", info.messageId);
  console.log("Preview URL: %s", nodemailer.getTestMessageUrl(info));
}
