const express = require('express');
const path = require('path');
const { exec } = require('child_process');
const app = express();
app.use(express.json());

// Anket verisi çekme fonksiyonu
function anketVeriCek(groupName) {
  return new Promise((resolve, reject) => {
    console.log(`${groupName} grubu için anket verisi çekiliyor...`);
    const scriptPath = path.join(__dirname, 'poll-data-extraction', 'wp-anket-veri.js');

    exec(`node "${scriptPath}" "${groupName}" 1`, (error, stdout, stderr) => {
      if (error) {
        console.error(`${groupName} grubu anket verisi çekilirken hata oluştu: ${error.message}`);
        reject(error);
        return;
      }
      if (stderr) {
        console.error(`${groupName} grubu anket verisi stderr: ${stderr}`);
        reject(new Error(stderr));
        return;
      }
      console.log(`${groupName} grubu anket verisi başarıyla çekildi: ${stdout}`);
      resolve(stdout);
    });
  });
}

// Anket gönderme fonksiyonu
function anketGonder(groupName) {
  return new Promise((resolve, reject) => {
    console.log(`${groupName} grubu için anket gönderiliyor...`);
    const scriptPath = path.join(__dirname, 'poll-data-extraction', 'wp-send-poll.py');
    const command = `python "${scriptPath}" "${groupName}"`;
    console.log(`Çalıştırılan komut: ${command}`);

    exec(command, (error, stdout, stderr) => {
      if (error) {
        console.error(`${groupName} grubu anket gönderiminde hata oluştu: ${error.message}`);
        reject(error);
        return;
      }
      if (stderr) {
        console.error(`${groupName} grubu anket gönderimi stderr: ${stderr}`);
        reject(new Error(stderr));
        return;
      }
      console.log(`${groupName} grubu anket gönderimi başarılı: ${stdout}`);
      resolve(stdout);
    });
  });
}

async function runJobsSequentially() {
  const gruplar = [
    { isim: 'Çatı Özel Ders(Çarşamba)', anketVeriCek: true, anketGonder: true },
    { isim: 'Uhuvvet Eşliğinde Mütalaa', anketVeriCek: true, anketGonder: false }
  ];

  for (const grup of gruplar) {
    try {
      if (grup.anketVeriCek) {
        try {
          await anketVeriCek(grup.isim);
        } catch (error) {
          console.error(`${grup.isim} grubu için anket verisi çekilirken hata oluştu:`, error.message);
          // Hata olsa bile devam et
          continue;
        }
      }

      if (grup.anketGonder) {
        try {
          await anketGonder(grup.isim);
        } catch (error) {
          console.error(`${grup.isim} grubu için anket gönderilirken hata oluştu:`, error.message);
          // Hata olsa bile devam et
          continue;
        }
      }
    } catch (error) {
      console.error(`${grup.isim} grubu için işlemler sırasında beklenmeyen bir hata oluştu:`, error.message);
      // Beklenmeyen hatalar için de devam et
      continue;
    }
  }

  console.log('Tüm işlemler tamamlandı.');
}

// Uygulama başlatıldığında işlemleri başlat
runJobsSequentially();
