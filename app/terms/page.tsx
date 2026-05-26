export default function TermsPage() {
  return (
    <section className="mx-auto grid w-full max-w-4xl gap-6">
      <header className="rounded-3xl border border-white/10 bg-white/5 p-6 backdrop-blur sm:p-8">
        <p className="text-xs uppercase tracking-[0.16em] text-cyan-200">Contrato Digital</p>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight text-white sm:text-4xl">
          TERMOS DE USO — PETTAPBR
        </h1>
        <p className="mt-3 text-xs text-zinc-400">Versão: v1 | Última atualização: 26/05/2026</p>
      </header>

      <article className="grid gap-5 rounded-3xl border border-white/10 bg-white/5 p-6 text-sm leading-7 text-zinc-200 backdrop-blur sm:p-8">
        <section>
          <p className="mt-2">
            Os presentes Termos de Uso regulam o acesso e utilização da plataforma PetTapBR,
            incluindo serviços de identificação digital de pets por NFC, QR Code, perfis online,
            notificações e funcionalidades relacionadas.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-white">1. Aceitação dos termos</h2>
          <p className="mt-2">
            Ao criar conta, ativar tag, cadastrar pet ou utilizar a plataforma, o usuário declara
            ter lido, compreendido e aceitado integralmente estes Termos e a Política de
            Privacidade.
          </p>
          <p className="mt-2">
            Caso não concorde, o usuário deverá interromper imediatamente a utilização dos
            serviços.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-white">2. Elegibilidade</h2>
          <p className="mt-2">
            O cadastro é permitido apenas para:
          </p>
          <ul className="mt-2 list-disc pl-6">
            <li>Pessoas maiores de 18 anos; ou</li>
            <li>Menores representados por responsável legal.</li>
          </ul>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-white">3. Cadastro e responsabilidade do usuário</h2>
          <p className="mt-2">O usuário compromete-se a:</p>
          <ul className="mt-2 list-disc pl-6">
            <li>Informar dados verdadeiros;</li>
            <li>Atualizar informações quando necessário;</li>
            <li>Manter senha protegida;</li>
            <li>Não compartilhar acesso indevidamente;</li>
            <li>Utilizar o serviço de forma lícita.</li>
          </ul>
          <p className="mt-2">
            O usuário responde integralmente pelas informações disponibilizadas no perfil do pet.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-white">4. Funcionamento do serviço</h2>
          <p className="mt-2">A PetTapBR oferece ferramenta digital de identificação animal.</p>
          <p className="mt-2">
            A plataforma não constitui serviço de rastreamento em tempo real, monitoramento ativo
            ou garantia de recuperação do animal.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-white">5. Limitação expressa de responsabilidade</h2>
          <p className="mt-2">A PetTapBR não garante, em nenhuma hipótese:</p>
          <ul className="mt-2 list-disc pl-6">
            <li>Localização do pet;</li>
            <li>Recuperação do animal;</li>
            <li>Contato por terceiros;</li>
            <li>Leitura do NFC em todos aparelhos;</li>
            <li>Funcionamento contínuo sem falhas;</li>
            <li>Recuperação após perda da tag;</li>
            <li>Compatibilidade universal.</li>
          </ul>
          <p className="mt-2">A efetividade depende, entre outros fatores:</p>
          <ul className="mt-2 list-disc pl-6">
            <li>Cadastro correto;</li>
            <li>Integridade física da tag;</li>
            <li>Internet;</li>
            <li>Dispositivo utilizado;</li>
            <li>Boa-fé de terceiros.</li>
          </ul>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-white">6. Isenção relacionada a perdas</h2>
          <p className="mt-2">A PetTapBR não será responsável por:</p>
          <ul className="mt-2 list-disc pl-6">
            <li>Danos indiretos;</li>
            <li>Lucros cessantes;</li>
            <li>Perda de oportunidade;</li>
            <li>Danos morais decorrentes de perda do animal;</li>
            <li>Custos veterinários;</li>
            <li>Gastos com busca ou resgate;</li>
            <li>Danos causados por terceiros.</li>
          </ul>
          <p className="mt-2">
            Na extensão permitida pela legislação aplicável, eventual responsabilidade da PetTapBR
            ficará limitada ao valor efetivamente pago pelo usuário nos últimos 12 meses.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-white">7. Tags físicas e produtos</h2>
          <p className="mt-2">A PetTapBR não responde por:</p>
          <ul className="mt-2 list-disc pl-6">
            <li>Quebra;</li>
            <li>Desgaste;</li>
            <li>Roubo;</li>
            <li>Mau uso;</li>
            <li>Danos após entrega;</li>
            <li>Instalação inadequada;</li>
            <li>Alterações realizadas pelo usuário.</li>
          </ul>
          <p className="mt-2">
            Garantias legais permanecem aplicáveis quando exigidas pela legislação brasileira.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-white">8. Assinaturas, pagamentos e cancelamentos</h2>
          <p className="mt-2">Funcionalidades podem depender de assinatura.</p>
          <p className="mt-2">Pagamentos serão processados por terceiros.</p>
          <p className="mt-2">Cancelamentos observarão:</p>
          <ul className="mt-2 list-disc pl-6">
            <li>Condições informadas no momento da contratação;</li>
            <li>Direito de arrependimento previsto em lei, quando aplicável.</li>
          </ul>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-white">9. Disponibilidade do serviço</h2>
          <p className="mt-2">A PetTapBR poderá realizar:</p>
          <ul className="mt-2 list-disc pl-6">
            <li>Atualizações;</li>
            <li>Correções;</li>
            <li>Manutenções;</li>
            <li>Suspensões temporárias.</li>
          </ul>
          <p className="mt-2">Sem obrigação de aviso prévio em situações emergenciais.</p>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-white">10. Conteúdo do usuário</h2>
          <p className="mt-2">
            Informações enviadas pelo usuário permanecem sob responsabilidade exclusiva do usuário.
          </p>
          <p className="mt-2">É proibido publicar:</p>
          <ul className="mt-2 list-disc pl-6">
            <li>Conteúdo ilícito;</li>
            <li>Informações falsas;</li>
            <li>Dados ofensivos;</li>
            <li>Violação de terceiros.</li>
          </ul>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-white">11. Suspensão ou encerramento</h2>
          <p className="mt-2">A conta poderá ser suspensa ou encerrada em caso de:</p>
          <ul className="mt-2 list-disc pl-6">
            <li>Fraude;</li>
            <li>Violação destes Termos;</li>
            <li>Uso abusivo;</li>
            <li>Exigência legal.</li>
          </ul>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-white">12. Propriedade intelectual</h2>
          <p className="mt-2">
            Marca, sistema, software, layout, logotipo e elementos da PetTapBR permanecem
            protegidos pela legislação aplicável.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-white">13. Alterações dos termos</h2>
          <p className="mt-2">Estes Termos poderão ser modificados.</p>
          <p className="mt-2">
            A continuidade de uso após atualização representa concordância.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-white">14. Lei aplicável e foro</h2>
          <p className="mt-2">
            Aplica-se a legislação brasileira.
          </p>
          <p className="mt-2">
            Fica eleito o foro da comarca do domicílio da empresa responsável pela PetTapBR, salvo
            competência legal obrigatória diversa.
          </p>
        </section>
      </article>
    </section>
  );
}
