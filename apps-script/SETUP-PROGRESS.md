# Setup en curso — retomar mañana

> Borra este fichero cuando termine el setup completo.

## Hecho

- [x] Cuenta Resend creada con `imcaletrio@gmail.com`
- [x] Dominio `0dopamine.com` añadido en Resend (región eu-west-1 Ireland)
- [x] Registros DNS de Resend extraídos (ver tabla abajo)

## Pendiente

- [ ] Crear los 4 registros DNS de Resend en Route 53
- [ ] Verificar dominio en Resend (esperar 5-30 min)
- [ ] Generar API key Resend (`re_...`) con scope "Sending access"
- [ ] ImprovMX: cuenta + dominio + 2 MX en Route 53 + alias `hola → imcaletrio@gmail.com`
- [ ] Apps Script: meter Script Properties (`SHEET_ID`, `RESEND_API_KEY`) + pegar `Code.gs` + redeploy
- [ ] Test end-to-end con `curl` al endpoint
- [ ] (Opcional) Gmail "Send as" para responder desde `hola@0dopamine.com`
- [ ] Borrar fila de test del Sheet
- [ ] Borrar este fichero y commit

## Registros DNS de Resend a crear en Route 53

⚠️ **Antes de pegar el DKIM, verifica en resend.com/domains** si el valor que muestran lleva prefijo `v=DKIM1; k=rsa; p=...` o solo `p=...`. Pega exactamente lo que Resend muestre — un carácter de más o de menos = DKIM fail = correos a spam.

| Tipo | Name                                | Value                                                     | TTL | Prio |
|------|-------------------------------------|-----------------------------------------------------------|-----|------|
| TXT  | `resend._domainkey.0dopamine.com`   | `p=MIGfMA0GCSqGSIb3DQEBAQUAA4GNADCBiQKBgQDFF04wgQhpdkM2AyvVkCqnveNur+eOF0JoMcVV/fMW801sQyD6nY2+S0bbK4g+qpt14QjI+LPMTxJr2WwD6laVBdIiycE/WxgCfK1/oGlfeoglIOKRxDwJDE5h/xORgsEk0U9zIwIQZGB1tnMANp3hvBrK50wu7XTJE/hp8CEAeQIDAQAB` | 300 | —    |
| MX   | `send.0dopamine.com`                | `feedback-smtp.eu-west-1.amazonses.com`                   | 300 | 10   |
| TXT  | `send.0dopamine.com`                | `v=spf1 include:amazonses.com ~all`                       | 300 | —    |
| TXT  | `_dmarc.0dopamine.com`              | `v=DMARC1; p=none;`                                       | 300 | —    |

## Atajo recomendado: AWS CLI

Más rápido que la consola web. Si tienes `aws configure` hecho:

```bash
ZONE_ID=$(aws route53 list-hosted-zones \
  --query "HostedZones[?Name=='0dopamine.com.'].Id" --output text | sed 's|/hostedzone/||')

cat > /tmp/resend-dns.json <<'EOF'
{
  "Changes": [
    {"Action":"UPSERT","ResourceRecordSet":{"Name":"resend._domainkey.0dopamine.com","Type":"TXT","TTL":300,"ResourceRecords":[{"Value":"\"p=MIGfMA0GCSqGSIb3DQEBAQUAA4GNADCBiQKBgQDFF04wgQhpdkM2AyvVkCqnveNur+eOF0JoMcVV/fMW801sQyD6nY2+S0bbK4g+qpt14QjI+LPMTxJr2WwD6laVBdIiycE/WxgCfK1/oGlfeoglIOKRxDwJDE5h/xORgsEk0U9zIwIQZGB1tnMANp3hvBrK50wu7XTJE/hp8CEAeQIDAQAB\""}]}},
    {"Action":"UPSERT","ResourceRecordSet":{"Name":"send.0dopamine.com","Type":"MX","TTL":300,"ResourceRecords":[{"Value":"10 feedback-smtp.eu-west-1.amazonses.com"}]}},
    {"Action":"UPSERT","ResourceRecordSet":{"Name":"send.0dopamine.com","Type":"TXT","TTL":300,"ResourceRecords":[{"Value":"\"v=spf1 include:amazonses.com ~all\""}]}},
    {"Action":"UPSERT","ResourceRecordSet":{"Name":"_dmarc.0dopamine.com","Type":"TXT","TTL":300,"ResourceRecords":[{"Value":"\"v=DMARC1; p=none;\""}]}}
  ]
}
EOF

aws route53 change-resource-record-sets --hosted-zone-id "$ZONE_ID" \
  --change-batch file:///tmp/resend-dns.json
```

Verifica:

```bash
dig +short TXT resend._domainkey.0dopamine.com @8.8.8.8
dig +short TXT send.0dopamine.com @8.8.8.8
dig +short MX  send.0dopamine.com @8.8.8.8
dig +short TXT _dmarc.0dopamine.com @8.8.8.8
```

Los 4 deben devolver el valor que metiste. Si vacío, espera 60s y reintenta.

## Prompt para retomar mañana con el otro Claude

```
Continuamos con el setup de 0dopamine.com.

Estado:
- Cuenta Resend creada (imcaletrio@gmail.com), dominio 0dopamine.com añadido
  en región eu-west-1.
- Los 4 DNS records están documentados en apps-script/SETUP-PROGRESS.md (lee
  ese fichero primero para tener el contexto exacto).
- Pendiente desde el PASO 1 punto 2 del plan original (crear los DNS en Route
  53 → verificar en Resend → API key → ImprovMX → Apps Script → test).

Atajo: usa AWS CLI desde mi terminal local, hay un bloque listo para
ejecutar en SETUP-PROGRESS.md sección "Atajo recomendado: AWS CLI". No uses
la consola web salvo que el CLI falle.

CRÍTICO: antes de meter el DKIM, abre resend.com/domains y verifica si el
valor empieza por "v=DKIM1; k=rsa; p=..." o solo por "p=...". El valor
guardado en SETUP-PROGRESS.md fue copiado por mí y puede estar incompleto.
Pega exactamente lo que Resend muestre.

Sigue el orden de pendientes del fichero. Borra el fichero y haz commit
cuando todo esté verificado end-to-end.
```
