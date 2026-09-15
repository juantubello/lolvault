import webpush from 'web-push';

const keys = webpush.generateVAPIDKeys();

console.log('Nuevo par VAPID (guardalo como secreto; este script no escribe archivos):');
console.log(`LOLVAULT_VAPID_PUBLIC_KEY=${keys.publicKey}`);
console.log(`LOLVAULT_VAPID_PRIVATE_KEY=${keys.privateKey}`);
console.log('LOLVAULT_VAPID_SUBJECT=mailto:tu-email@example.com');
console.log('\nCopiá las tres variables al .env del servidor y no vuelvas a rotar el par:');
console.log('cambiarlo invalida todas las suscripciones existentes.');
