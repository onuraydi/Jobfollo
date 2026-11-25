import type { Item, Locale } from "./types.js";

export type TemplateChannel = "email" | "message";

export type TemplateCategory =
  | "application"
  | "general"
  | "follow_up"
  | "networking"
  | "thank_you";

export interface MessageTemplate {
  id: string;
  name: string;
  channel: TemplateChannel;
  category: TemplateCategory;
  subject?: string;
  body: string;
  builtIn?: boolean;
}

export interface MessageTemplateVars {
  company: string;
  title: string;
  role: string;
  contact: string;
}

export function buildTemplateVars(
  item: Pick<Item, "title" | "company" | "role" | "contacts">,
): MessageTemplateVars {
  const company = item.company?.trim() || item.title.trim();
  const title = item.title.trim();
  const role = item.role?.trim() || "";
  const contact = item.contacts[0]?.name.trim() || "";
  return { company, title, role, contact };
}

/**
 * Pure placeholder substitution for copy-ready outreach messages and emails.
 * Replaces `{{company}}`, `{{title}}`, `{{role}}`, and `{{contact}}`.
 */
export function renderMessageTemplate(
  template: string,
  vars: Partial<MessageTemplateVars>,
): string {
  const replacements: Record<string, string> = {
    company: vars.company ?? vars.title ?? "",
    title: vars.title ?? vars.company ?? "",
    role: vars.role ?? "",
    contact: vars.contact ?? "",
  };

  return template.replace(/\{\{\s*(company|title|role|contact)\s*\}\}/g, (_match, key: string) => {
    return replacements[key] ?? "";
  });
}

export function renderTemplate(
  template: Pick<MessageTemplate, "subject" | "body">,
  vars: Partial<MessageTemplateVars>,
): { subject: string; body: string } {
  return {
    subject: template.subject ? renderMessageTemplate(template.subject, vars) : "",
    body: renderMessageTemplate(template.body, vars),
  };
}

export function buildMailtoHref(subject: string, body: string, to = ""): string {
  const params: string[] = [];
  if (subject.trim().length > 0) {
    params.push(`subject=${encodeURIComponent(subject)}`);
  }
  if (body.trim().length > 0) {
    params.push(`body=${encodeURIComponent(body)}`);
  }
  const query = params.length > 0 ? `?${params.join("&")}` : "";
  return `mailto:${encodeURIComponent(to.trim())}${query}`;
}

export function builtInMessageTemplates(locale: Locale): MessageTemplate[] {
  if (locale === "tr") {
    return [
      {
        id: "builtin-email-job-posting",
        name: "Açık ilan başvurusu e-postası",
        channel: "email",
        category: "application",
        subject: "{{role}} Başvurusu — {{company}}",
        body: `Merhaba {{contact}},

{{company}} bünyesindeki {{role}} pozisyonu için açılan ilana başvurumu iletmek istiyorum.

Güncel özgeçmişimi ekte paylaşıyorum. Pozisyonun gereksinimleri ve ekibinize sağlayabileceğim katkılar hakkında kısaca görüşmekten memnuniyet duyarım.

Zamanınız için teşekkür eder, iyi çalışmalar dilerim.`,
        builtIn: true,
      },
      {
        id: "builtin-email-general",
        name: "Genel başvuru e-postası",
        channel: "email",
        category: "general",
        subject: "Genel Başvuru — {{role}} | {{company}}",
        body: `Merhaba {{contact}},

{{company}} ekibinin çalışmalarını yakından takip ediyorum. Şu an açık bir ilan olmasa da {{role}} alanındaki deneyimimle ekibinize katkı sağlayabileceğime inanıyorum.

Uygun bir pozisyon oluştuğunda değerlendirilmek üzere özgeçmişimi ekte paylaşıyorum. Kısa bir tanışma görüşmesi yapma şansımız olursa çok sevinirim.

İlginiz için teşekkürler, iyi çalışmalar.`,
        builtIn: true,
      },
      {
        id: "builtin-email-followup",
        name: "7. gün takip e-postası",
        channel: "email",
        category: "follow_up",
        subject: "Takip: {{role}} Başvurusu — {{company}}",
        body: `Merhaba {{contact}},

Geçtiğimiz hafta {{company}} bünyesindeki {{role}} pozisyonu için ilettiğim başvurum hakkında kısa bir takip mesajı yazmak istedim.

Süreçle ilgili paylaşabileceğiniz bir güncelleme veya ek bilgi ihtiyacınız olursa memnuniyetle yardımcı olurum.

İyi çalışmalar dilerim.`,
        builtIn: true,
      },
      {
        id: "builtin-email-thankyou",
        name: "Mülakat sonrası teşekkür e-postası",
        channel: "email",
        category: "thank_you",
        subject: "Teşekkürler — {{role}} Görüşmesi ({{company}})",
        body: `Merhaba {{contact}},

Bugün {{company}} ve {{role}} pozisyonu hakkında gerçekleştirdiğimiz görüşme için çok teşekkür ederim.

Ekibin yaklaşımını ve üzerinde çalıştığınız projeleri dinlemek çok keyifliydi. Sürecin sonraki adımlarını heyecanla bekliyorum.

Saygılarımla.`,
        builtIn: true,
      },
      {
        id: "builtin-msg-linkedin-connect",
        name: "LinkedIn bağlantı isteği notu",
        channel: "message",
        category: "networking",
        body: `Merhaba {{contact}}, {{company}} bünyesindeki {{role}} pozisyonuna başvurdum. Ekibiniz ve süreç hakkında kısaca bilgi almak için bağlantı kurmak isterim. İyi çalışmalar!`,
        builtIn: true,
      },
      {
        id: "builtin-msg-followup-dm",
        name: "Kısa takip mesajı (DM)",
        channel: "message",
        category: "follow_up",
        body: `Merhaba {{contact}}, {{company}} {{role}} başvurumla ilgili kısa bir hatırlatma yazmak istedim. Müsait olduğunuzda süreç hakkında dönüş yapabilirseniz çok sevinirim. Teşekkürler!`,
        builtIn: true,
      },
    ];
  }

  return [
    {
      id: "builtin-email-job-posting",
      name: "Job posting application email",
      channel: "email",
      category: "application",
      subject: "Application for {{role}} — {{company}}",
      body: `Hi {{contact}},

I am writing to apply for the {{role}} position at {{company}}.

I have attached my resume for your review and would welcome the opportunity to briefly discuss how my background aligns with your team's goals.

Thank you for your time and consideration.`,
      builtIn: true,
    },
    {
      id: "builtin-email-general",
      name: "Spontaneous general application email",
      channel: "email",
      category: "general",
      subject: "General Application — {{role}} at {{company}}",
      body: `Hi {{contact}},

I have been following {{company}}'s work closely and would love to be considered for any current or upcoming {{role}} opportunities on your team.

I have attached my resume and would be glad to connect for a brief introductory chat whenever convenient.

Best regards.`,
      builtIn: true,
    },
    {
      id: "builtin-email-followup",
      name: "7-day follow-up email",
      channel: "email",
      category: "follow_up",
      subject: "Following up: {{role}} at {{company}}",
      body: `Hi {{contact}},

I wanted to briefly follow up on my application for the {{role}} role at {{company}} submitted last week.

Please let me know if there are any updates or additional details I can provide.

Best regards.`,
      builtIn: true,
    },
    {
      id: "builtin-email-thankyou",
      name: "Post-interview thank-you email",
      channel: "email",
      category: "thank_you",
      subject: "Thank you — {{role}} interview ({{company}})",
      body: `Hi {{contact}},

Thank you for taking the time to speak with me about the {{role}} opportunity at {{company}}.

I enjoyed learning more about your team and the projects ahead, and I look forward to the next steps.

Best regards.`,
      builtIn: true,
    },
    {
      id: "builtin-msg-linkedin-connect",
      name: "LinkedIn connection note",
      channel: "message",
      category: "networking",
      body: `Hi {{contact}}, I recently applied for the {{role}} role at {{company}} and would love to connect and learn more about your team!`,
      builtIn: true,
    },
    {
      id: "builtin-msg-followup-dm",
      name: "Short follow-up DM",
      channel: "message",
      category: "follow_up",
      body: `Hi {{contact}}, just checking in on my {{role}} application at {{company}}. Let me know if there is any update when you have a moment. Thanks!`,
      builtIn: true,
    },
  ];
}
