import {
  COPY_LIMITS,
  COPY_VARIANTS_PER_GENERATION,
  type CopyGenerateAngle,
} from "../../../../shared/constants";

export type CopyPromptProduct = {
  name: string;
  description: string | null;
  primaryText: string;
  headline: string;
  priceMinor: number | null;
  currency: string;
};

export type CopyPromptInput = {
  product: CopyPromptProduct;
  angle: CopyGenerateAngle;
  customAngle?: string;
};

const ANGLE_BRIEFS: Record<CopyGenerateAngle, string> = {
  dolor: "Dolor: arrancá con el problema que el cliente quiere resolver.",
  beneficio:
    "Beneficio: destacá el resultado principal que obtiene el cliente.",
  prueba_social:
    "Prueba social: apoyate en la confianza de otros clientes, sin inventar cifras ni testimonios.",
  oferta: "Oferta: poné en primer plano la promoción o el precio.",
  urgencia:
    "Urgencia: transmití que conviene actuar ahora, sin mentir sobre stock ni plazos.",
  libre: "Libre: elegí el enfoque que mejor venda este producto.",
};

export const COPY_SYSTEM_PROMPT = `Sos un redactor publicitario experto en anuncios de Meta Ads para Argentina y Uruguay.
Escribís en español rioplatense (voseo: "comprá", "descubrí", "tenés"), natural y directo.

Políticas de publicidad de Meta que tenés que respetar:
- No afirmes ni insinúes atributos personales del lector (salud, edad, situación económica, orientación, etnia, religión).
- No prometas resultados garantizados, "antes y después" ni ganancias seguras.
- No uses afirmaciones médicas o de salud no verificables ni lenguaje sensacionalista.
- No uses mayúsculas excesivas, signos repetidos ni clickbait engañoso.
- No inventes precios, descuentos, stock, reseñas ni datos que no estén en la información del producto.

Límites de caracteres, estrictos:
- headline: máximo ${COPY_LIMITS.headline}.
- primaryText: máximo ${COPY_LIMITS.primaryText}.
- description: máximo ${COPY_LIMITS.description}.

Para cada variante evaluá el riesgo de incumplir políticas: "none", "low" o "high", y explicalo brevemente en policyNote (vacío si es "none").
Respondé solo con JSON válido, sin texto adicional, con esta forma:
{"variants":[{"primaryText":"...","headline":"...","description":"...","policyRisk":"none","policyNote":""}]}`;

const formatPrice = ({ priceMinor, currency }: CopyPromptProduct) =>
  priceMinor === null ? null : `${(priceMinor / 100).toFixed(2)} ${currency}`;

const angleBrief = ({ angle, customAngle }: CopyPromptInput) =>
  customAngle
    ? `${ANGLE_BRIEFS[angle]} Indicación del usuario: ${customAngle}`
    : ANGLE_BRIEFS[angle];

export function buildCopyPrompt(input: CopyPromptInput) {
  const { product } = input;
  const price = formatPrice(product);
  const lines = [
    `Producto: ${product.name}`,
    product.description ? `Descripción: ${product.description}` : null,
    `Texto actual: ${product.primaryText}`,
    `Título actual: ${product.headline}`,
    price ? `Precio: ${price}` : null,
    `Ángulo: ${angleBrief(input)}`,
    `Generá ${COPY_VARIANTS_PER_GENERATION} variantes distintas entre sí.`,
  ];
  return lines.filter((line) => line !== null).join("\n");
}

export const buildCopyRetryPrompt = (prompt: string) =>
  `${prompt}\n\nLa respuesta anterior superó los límites de caracteres. Reescribí las ${COPY_VARIANTS_PER_GENERATION} variantes y respetá estrictamente: headline hasta ${COPY_LIMITS.headline}, primaryText hasta ${COPY_LIMITS.primaryText}, description hasta ${COPY_LIMITS.description} caracteres.`;
