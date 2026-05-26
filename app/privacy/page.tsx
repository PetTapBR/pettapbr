export default function PrivacyPage() {
  return (
    <section className="mx-auto grid w-full max-w-4xl gap-6">
      <header className="rounded-3xl border border-white/10 bg-white/5 p-6 backdrop-blur sm:p-8">
        <p className="text-xs uppercase tracking-[0.16em] text-cyan-200">LGPD</p>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight text-white sm:text-4xl">
          POLÍTICA DE PRIVACIDADE — PETTAPBR (LGPD)
        </h1>
        <p className="mt-3 text-xs text-zinc-400">Versão: v1 | Última atualização: 26/05/2026</p>
      </header>

      <article className="grid gap-5 rounded-3xl border border-white/10 bg-white/5 p-6 text-sm leading-7 text-zinc-200 backdrop-blur sm:p-8">
        <section>
          <p className="mt-2">
            Esta Política explica como a PetTapBR coleta, utiliza, armazena e protege dados
            pessoais conforme a Lei nº 13.709/2018 (LGPD).
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-white">1. Dados coletados</h2>
          <p className="mt-2 font-semibold text-white">Dados do tutor:</p>
          <ul className="list-disc pl-6">
            <li>Nome;</li>
            <li>Telefone;</li>
            <li>E-mail;</li>
            <li>Login;</li>
            <li>Senha criptografada;</li>
            <li>Informações de pagamento.</li>
          </ul>
          <p className="mt-2 font-semibold text-white">Dados do pet:</p>
          <ul className="list-disc pl-6">
            <li>Nome;</li>
            <li>Foto;</li>
            <li>Características;</li>
            <li>Dados médicos opcionais;</li>
            <li>Informações fornecidas pelo tutor.</li>
          </ul>
          <p className="mt-2 font-semibold text-white">Dados automáticos:</p>
          <ul className="list-disc pl-6">
            <li>Endereço IP;</li>
            <li>Navegador;</li>
            <li>Sistema operacional;</li>
            <li>Data/hora;</li>
            <li>Dispositivo;</li>
            <li>Logs;</li>
            <li>Localização quando compartilhada;</li>
            <li>Registros de leitura NFC/QR.</li>
          </ul>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-white">2. Finalidades</h2>
          <p className="mt-2">Os dados poderão ser utilizados para:</p>
          <ul className="mt-2 list-disc pl-6">
            <li>Operação da plataforma;</li>
            <li>Identificação do pet;</li>
            <li>Facilitar contato;</li>
            <li>Segurança;</li>
            <li>Pagamentos;</li>
            <li>Suporte;</li>
            <li>Prevenção de fraude;</li>
            <li>Obrigações legais;</li>
            <li>Estatísticas internas.</li>
          </ul>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-white">3. Bases legais</h2>
          <p className="mt-2">Tratamentos podem ocorrer com fundamento em:</p>
          <ul className="mt-2 list-disc pl-6">
            <li>Execução contratual;</li>
            <li>Consentimento;</li>
            <li>Obrigação legal;</li>
            <li>Legítimo interesse;</li>
            <li>Exercício regular de direitos.</li>
          </ul>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-white">4. Compartilhamento</h2>
          <p className="mt-2">Dados poderão ser compartilhados com operadores necessários:</p>
          <p className="mt-2">Exemplos:</p>
          <ul className="mt-2 list-disc pl-6">
            <li>Hospedagem;</li>
            <li>Firebase;</li>
            <li>Google;</li>
            <li>Cloudflare;</li>
            <li>Serviços de pagamento;</li>
            <li>Autenticação;</li>
            <li>E-mail;</li>
            <li>Analytics.</li>
          </ul>
          <p className="mt-2">Sempre dentro da finalidade operacional.</p>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-white">5. Transferência internacional</h2>
          <p className="mt-2">
            Alguns parceiros tecnológicos podem armazenar dados fora do Brasil.
          </p>
          <p className="mt-2">
            Ao utilizar a plataforma, o usuário reconhece que determinados dados poderão ser
            tratados internacionalmente, observadas medidas legais aplicáveis.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-white">6. Retenção dos dados</h2>
          <p className="mt-2">Os dados poderão permanecer armazenados:</p>
          <ul className="mt-2 list-disc pl-6">
            <li>Durante prestação do serviço;</li>
            <li>Para cumprimento legal;</li>
            <li>Defesa judicial;</li>
            <li>Auditoria;</li>
            <li>Prevenção a fraude.</li>
          </ul>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-white">7. Segurança</h2>
          <p className="mt-2">São adotadas medidas razoáveis para proteção.</p>
          <p className="mt-2">Todavia, nenhum sistema é totalmente invulnerável.</p>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-white">8. Cookies</h2>
          <p className="mt-2">A plataforma poderá usar cookies para:</p>
          <ul className="mt-2 list-disc pl-6">
            <li>Login;</li>
            <li>Segurança;</li>
            <li>Desempenho;</li>
            <li>Estatísticas.</li>
          </ul>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-white">9. Direitos do titular (LGPD)</h2>
          <p className="mt-2">Usuários poderão solicitar:</p>
          <ul className="mt-2 list-disc pl-6">
            <li>Confirmação;</li>
            <li>Acesso;</li>
            <li>Correção;</li>
            <li>Exclusão;</li>
            <li>Portabilidade;</li>
            <li>Revogação;</li>
            <li>Anonimização;</li>
            <li>Informações sobre compartilhamento.</li>
          </ul>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-white">10. Exclusão da conta</h2>
          <p className="mt-2">Solicitações poderão ser feitas pelo canal informado.</p>
          <p className="mt-2">
            Alguns dados poderão permanecer armazenados por obrigação legal.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-white">11. Menores</h2>
          <p className="mt-2">
            A plataforma não se destina a coleta intencional de dados de menores sem responsável
            legal.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-white">12. Incidentes de segurança</h2>
          <p className="mt-2">
            Em caso de incidente relevante envolvendo dados pessoais, medidas serão adotadas
            conforme legislação aplicável.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-white">13. Atualizações</h2>
          <p className="mt-2">Esta Política poderá ser alterada periodicamente.</p>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-white">14. Canal LGPD / Contato</h2>
          <p className="mt-2">
            E-mail:{" "}
            <a className="text-cyan-200 underline underline-offset-2" href="mailto:pettapbr@gmail.com">
              pettapbr@gmail.com
            </a>
          </p>
          <p className="mt-2">Responsável pelo tratamento: PetTapBR</p>
        </section>
      </article>
    </section>
  );
}

