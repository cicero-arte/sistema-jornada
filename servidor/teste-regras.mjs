import { initializeTestEnvironment, assertSucceeds, assertFails } from "@firebase/rules-unit-testing";
import { readFileSync } from "fs";
import { doc, setDoc, getDoc, updateDoc, deleteDoc, serverTimestamp, Timestamp, collection, getDocs } from "firebase/firestore";
import { ref, uploadBytes, getBytes, deleteObject } from "firebase/storage";

const PROF = "WWCWsIyLX2U2L2GQjwQx90HBtEo1";
const env = await initializeTestEnvironment({
  projectId: "sistema-jornada",
  firestore: { rules: readFileSync("firestore.rules", "utf8"), host: "127.0.0.1", port: 8085 },
  storage: { rules: readFileSync("storage.rules", "utf8"), host: "127.0.0.1", port: 9199 }
});
const anon = (uid) => env.authenticatedContext(uid, { firebase: { sign_in_provider: "anonymous" } });
const prof = env.authenticatedContext(PROF, { firebase: { sign_in_provider: "password" } });
const outro = env.authenticatedContext("xyz", { firebase: { sign_in_provider: "password" } }); const fsOutro = outro.firestore();
const base = () => ({ nome: "Aluno Teste", nascimento: "2014-05-10", idade: 12, modalidade: "Aula online", dias: [], periodos: [], outroHorario: "", comoConheceu: "Indicação", estilo: "Mangá, personagens de anime",
  responsavel: "Responsável Teste", whatsapp: "61900000000", usuarioWhatsapp: "", email: "teste@exemplo.com", menor: true, autorizacao: true,
  versaoAviso: "2026-11", criadoEm: serverTimestamp() });
const jpg = (n) => new Uint8Array(n);
let ok = 0, falhas = 0;
async function t(nome, p) { try { await p; ok++; console.log("ok   ", nome); } catch (e) { falhas++; console.log("FALHA", nome, e.message); } }

// Fora do prazo: prepara a rodada 1 do aluno3, começada há 20 minutos.
await env.withSecurityRulesDisabled(async (c) => {
  const f = c.firestore();
  await setDoc(doc(f, "inscricoes/aluno3"), { nome: "x" });
  await setDoc(doc(f, "inscricoes/aluno3/rodadas/1"), { tipo: "x", proposta: "y", inicio: Timestamp.fromMillis(Date.now() - 20*60*1000) });
});
const C = anon("aluno3");
const fsC = C.firestore();

const A = anon("aluno1"), fsA = A.firestore(), stA = A.storage();
await t("anônimo cria a própria inscrição", assertSucceeds(setDoc(doc(fsA, "inscricoes/aluno1"), base())));
await t("anônimo não cria inscrição com outro id", assertFails(setDoc(doc(fsA, "inscricoes/outro"), base())));
await t("anônimo não lê a própria inscrição", assertFails(getDoc(doc(fsA, "inscricoes/aluno1"))));
await t("anônimo não lista inscrições", assertFails(getDocs(collection(fsA, "inscricoes"))));
await t("anônimo não altera a inscrição", assertFails(updateDoc(doc(fsA, "inscricoes/aluno1"), { nome: "X" })));
await t("anônimo não apaga a inscrição", assertFails(deleteDoc(doc(fsA, "inscricoes/aluno1"))));
await t("anônimo não lê sistema/dados", assertFails(getDoc(doc(fsA, "sistema/dados"))));
await t("anônimo não grava sistema/dados", assertFails(setDoc(doc(fsA, "sistema/dados"), { a: 1 })));
const B = anon("aluno2").firestore();
await t("menor sem responsável é recusado", assertFails(setDoc(doc(B, "inscricoes/aluno2"), { ...base(), responsavel: "" })));
await t("campo extra é recusado", assertFails(setDoc(doc(B, "inscricoes/aluno2"), { ...base(), cpf: "1" })));
await t("sem autorização é recusado", assertFails(setDoc(doc(B, "inscricoes/aluno2"), { ...base(), autorizacao: false })));
await t("data de criação falsa é recusada", assertFails(setDoc(doc(B, "inscricoes/aluno2"), { ...base(), criadoEm: Timestamp.fromDate(new Date(2020,0,1)) })));
await t("modalidade inválida é recusada", assertFails(setDoc(doc(B, "inscricoes/aluno2"), { ...base(), modalidade: "VIP" })));
await t("sem número e sem usuário do WhatsApp é recusado", assertFails(setDoc(doc(B, "inscricoes/aluno2"), { ...base(), whatsapp: "", usuarioWhatsapp: "" })));
await t("usuário do WhatsApp com caractere inválido é recusado", assertFails(setDoc(doc(B, "inscricoes/aluno2"), { ...base(), usuarioWhatsapp: "maria desenhos!" })));
await t("login com e-mail (não anônimo) não cria", assertFails(setDoc(doc(fsOutro, "inscricoes/xyz"), base())));

const rod = (n) => ({ tipo: "Figura humana", proposta: "Desenhe algo.", inicio: serverTimestamp() });
await t("rodada 2 antes de enviar a 1 é recusada", assertFails(setDoc(doc(fsA, "inscricoes/aluno1/rodadas/2"), rod())));
await t("foto antes de começar a rodada é recusada", assertFails(uploadBytes(ref(stA, "inscricoes/aluno1/1/foto.jpg"), jpg(1000), { contentType: "image/jpeg" })));
await t("rodada 1 começa", assertSucceeds(setDoc(doc(fsA, "inscricoes/aluno1/rodadas/1"), rod())));
await t("rodada 1 não pode recomeçar", assertFails(setDoc(doc(fsA, "inscricoes/aluno1/rodadas/1"), rod())));
await t("rodada 4 não existe", assertFails(setDoc(doc(fsA, "inscricoes/aluno1/rodadas/4"), rod())));
await t("foto PNG é recusada", assertFails(uploadBytes(ref(stA, "inscricoes/aluno1/1/foto.jpg"), jpg(1000), { contentType: "image/png" })));
await t("foto de 3 MB é recusada", assertFails(uploadBytes(ref(stA, "inscricoes/aluno1/1/foto.jpg"), jpg(3*1024*1024), { contentType: "image/jpeg" })));
await t("foto em outra inscrição é recusada", assertFails(uploadBytes(ref(stA, "inscricoes/outro/1/foto.jpg"), jpg(1000), { contentType: "image/jpeg" })));
await t("foto JPEG no prazo entra", assertSucceeds(uploadBytes(ref(stA, "inscricoes/aluno1/1/foto.jpg"), jpg(200000), { contentType: "image/jpeg" })));
await t("foto não pode ser trocada", assertFails(uploadBytes(ref(stA, "inscricoes/aluno1/1/foto.jpg"), jpg(1000), { contentType: "image/jpeg" })));
await t("anônimo não lê a foto", assertFails(getBytes(ref(stA, "inscricoes/aluno1/1/foto.jpg"))));
await t("anônimo não apaga a foto", assertFails(deleteObject(ref(stA, "inscricoes/aluno1/1/foto.jpg"))));
await t("registro do envio 1 entra", assertSucceeds(setDoc(doc(fsA, "inscricoes/aluno1/envios/1"), { enviadoEm: serverTimestamp(), tamanho: 200000 })));
await t("envio 1 não pode ser refeito", assertFails(setDoc(doc(fsA, "inscricoes/aluno1/envios/1"), { enviadoEm: serverTimestamp(), tamanho: 1 })));
await t("rodada 2 começa depois do envio 1", assertSucceeds(setDoc(doc(fsA, "inscricoes/aluno1/rodadas/2"), rod())));

await t("foto fora do prazo é recusada", assertFails(uploadBytes(ref(C.storage(), "inscricoes/aluno3/1/foto.jpg"), jpg(1000), { contentType: "image/jpeg" })));
await t("envio fora do prazo é recusado", assertFails(setDoc(doc(fsC, "inscricoes/aluno3/envios/1"), { enviadoEm: serverTimestamp(), tamanho: 1 })));

await t("rodada 2 libera quando o prazo da 1 acabou", assertSucceeds(setDoc(doc(fsC, "inscricoes/aluno3/rodadas/2"), rod())));
await t("rodada 3 não libera com a 2 ainda no prazo", assertFails(setDoc(doc(fsC, "inscricoes/aluno3/rodadas/3"), rod())));
const D = anon("aluno4").firestore();
await t("só o nome de usuário do WhatsApp é aceito", assertSucceeds(setDoc(doc(D, "inscricoes/aluno4"), { ...base(), whatsapp: "", usuarioWhatsapp: "maria.desenhos" })));
await t("inscrição sem estilo é recusada", assertFails(setDoc(doc(anon("aluno5").firestore(), "inscricoes/aluno5"), { ...base(), estilo: "" })));
await t("inscrição com o campo antigo horarios é recusada", assertFails(setDoc(doc(anon("aluno6").firestore(), "inscricoes/aluno6"), { ...base(), horarios: [] })));

// ===== Opções públicas, convites e cadastro definitivo =====
const fsProfC = prof.firestore();
await t("professor grava as opções públicas", assertSucceeds(setDoc(doc(fsProfC, "publico/inscricao"), { dias: ["Segunda-feira"], periodos: ["Tarde"], onlineAberta: false })));
await t("professor cria convite", assertSucceeds(setDoc(doc(fsProfC, "convites/codigoBom123"), { menor: true, validoAte: Timestamp.fromMillis(Date.now() + 14 * 86400000) })));
await t("professor cria convite vencido (teste)", assertSucceeds(setDoc(doc(fsProfC, "convites/codigoVelho"), { menor: true, validoAte: Timestamp.fromMillis(Date.now() - 1000) })));
const semLogin = env.unauthenticatedContext().firestore();
await t("visitante lê as opções públicas", assertSucceeds(getDoc(doc(semLogin, "publico/inscricao"))));
await t("visitante não grava as opções públicas", assertFails(setDoc(doc(semLogin, "publico/inscricao"), { dias: [] })));
await t("visitante lê um convite pelo código", assertSucceeds(getDoc(doc(semLogin, "convites/codigoBom123"))));
await t("visitante não lista convites", assertFails(getDocs(collection(semLogin, "convites"))));
await t("visitante não cria convite", assertFails(setDoc(doc(semLogin, "convites/inventado"), { menor: false, validoAte: Timestamp.fromMillis(Date.now() + 86400000) })));
const mat = () => ({ contratanteProprioAluno: false, contratanteNome: "", cpf: "52998224725", cep: "73000000", logradouro: "Quadra 1 Conjunto A", conjunto: "", numero: "10", complemento: "", bairro: "Sobradinho", cidade: "Brasília", uf: "DF", adaptacao: "", autorizaAdaptacao: false, confirmacao: true, enviadoEm: serverTimestamp() });
const M = anon("familia1").firestore();
await t("cadastro definitivo sem login é recusado", assertFails(setDoc(doc(semLogin, "matriculas/codigoBom123"), mat())));
await t("cadastro definitivo com código inexistente é recusado", assertFails(setDoc(doc(M, "matriculas/inventado"), mat())));
await t("cadastro definitivo com convite vencido é recusado", assertFails(setDoc(doc(M, "matriculas/codigoVelho"), mat())));
await t("CPF com letras é recusado", assertFails(setDoc(doc(M, "matriculas/codigoBom123"), { ...mat(), cpf: "5299822472a" })));
await t("informação de adaptação sem autorização é recusada", assertFails(setDoc(doc(M, "matriculas/codigoBom123"), { ...mat(), adaptacao: "Texto fictício" })));
await t("campo extra no cadastro definitivo é recusado", assertFails(setDoc(doc(M, "matriculas/codigoBom123"), { ...mat(), rg: "1" })));
await t("cadastro definitivo válido entra", assertSucceeds(setDoc(doc(M, "matriculas/codigoBom123"), { ...mat(), adaptacao: "Texto fictício", autorizaAdaptacao: true })));
await t("cadastro definitivo não pode ser enviado de novo", assertFails(setDoc(doc(anon("familia2").firestore(), "matriculas/codigoBom123"), mat())));
await t("família não lê o cadastro enviado", assertFails(getDoc(doc(M, "matriculas/codigoBom123"))));
await t("professor lê o cadastro definitivo", assertSucceeds(getDoc(doc(fsProfC, "matriculas/codigoBom123"))));
const fsP = fsProfC, stP = prof.storage();
await t("professor lista inscrições", assertSucceeds(getDocs(collection(fsP, "inscricoes"))));
await t("professor lê rodadas e envios", assertSucceeds(getDocs(collection(fsP, "inscricoes/aluno1/envios"))));
await t("professor altera a inscrição", assertSucceeds(updateDoc(doc(fsP, "inscricoes/aluno1"), { status: "aprovado" })));
await t("professor lê a foto", assertSucceeds(getBytes(ref(stP, "inscricoes/aluno1/1/foto.jpg"))));
await t("professor lê e grava sistema/dados", assertSucceeds(setDoc(doc(fsP, "sistema/dados"), { a: 1 }).then(() => getDoc(doc(fsP, "sistema/dados")))));
await t("professor apaga a foto", assertSucceeds(deleteObject(ref(stP, "inscricoes/aluno1/1/foto.jpg"))));
await t("outro usuário logado não lê nada", assertFails(getDoc(doc(fsOutro, "inscricoes/aluno1"))));
await t("sem login não cria nada", assertFails(setDoc(doc(semLogin, "inscricoes/semlogin"), base())));

console.log(`\n${ok} certos, ${falhas} com falha`);
await env.cleanup();
process.exit(falhas ? 1 : 0);
