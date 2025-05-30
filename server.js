const express = require('express');
const path = require('path');
const { exec } = require('child_process');
const mongoose = require('mongoose');
require('dotenv').config();
const app = express();
app.use(express.json());

// MongoDB bağlantısı
mongoose.connect(process.env.MONGO_URI, { dbName: process.env.DB_NAME });

// Modelleri tanımla
const userSchema = new mongoose.Schema({
  name: String,
  profileImage: { type: String, default: 'default.png' },
  wpName: String
});

const readingStatusSchema = new mongoose.Schema({
  userId: String,
  date: String,
  status: String
});

const sentenceSchema = new mongoose.Schema({ sentence: String }, { collection: 'sentences' });
const hadisSchema = new mongoose.Schema({ sentence: String }, { collection: 'hadisler' });
const duaSchema = new mongoose.Schema({ sentence: String }, { collection: 'dualar' });
const ayetSchema = new mongoose.Schema({ sentence: String }, { collection: 'ayetler' });

const Sentence = mongoose.model('Sentence', sentenceSchema);
const Hadis = mongoose.model('Hadis', hadisSchema);
const Dua = mongoose.model('Dua', duaSchema);
const Ayet = mongoose.model('Ayet', ayetSchema);

const User = mongoose.model('User', userSchema);
const ReadingStatus = mongoose.model('ReadingStatus', readingStatusSchema);

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

// Hatırlatma mesajı oluşturma fonksiyonu
async function hatirlatmaMesajiOlustur() {
  try {
    const users = await User.find({});
    const mesajlar = [];
    let herkesOkumus = true;

    for (const user of users) {
      // Dünün tarihini al
      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);
      const yesterdayStr = yesterday.toISOString().split('T')[0];

      // Kullanıcının okuma durumlarını tarihe göre sırala
      const readingStatuses = await ReadingStatus.find({ userId: user._id.toString() })
        .sort({ date: -1 });

      let consecutiveMissedDays = 0;

      // Dünden geriye doğru kontrol et
      for (const status of readingStatuses) {
        if (status.date <= yesterdayStr) {
          if (status.status === 'okumadım') {
            consecutiveMissedDays++;
            herkesOkumus = false;
          } else if (status.status === 'okudum') {
            break;
          }
        }
      }

      // Eğer ard arda okumama varsa mesaja ekle
      if (consecutiveMissedDays > 0) {
        mesajlar.push(`${user.name} ${consecutiveMissedDays} gündür`);
      }
    }

    // Mesajı oluştur
    if (mesajlar.length > 0) {
      return `${mesajlar.join(', ')} okumalarını yapmadı. Az da olsa devamlı okuyalım!`;
    } else if (herkesOkumus) {
      return "Harika! Herkes okumalarını yapmış! 🎉";
    }
    return null;
  } catch (error) {
    console.error('Hatırlatma mesajı oluşturulurken hata:', error);
    throw error;
  }
}

// Hatırlatma mesajı gönderme fonksiyonu
function hatirlatmaMesajiGonder(groupName, message) {
  return new Promise((resolve, reject) => {
    const scriptPath = path.join(__dirname, 'poll-data-extraction', 'wp-oto-mesaj.py');
    const command = `python "${scriptPath}" "${groupName}" "${message}"`;
    console.log(`Hatırlatma mesajı gönderiliyor: ${command}`);
    exec(command, (error, stdout, stderr) => {
      if (error) {
        console.error(`${groupName} grubu hatırlatma mesajı gönderiminde hata oluştu: ${error.message}`);
        reject(error);
        return;
      }
      if (stderr) {
        console.error(`${groupName} grubu hatırlatma mesajı gönderimi stderr: ${stderr}`);
        reject(new Error(stderr));
        return;
      }
      console.log(`${groupName} grubu hatırlatma mesajı gönderimi başarılı: ${stdout}`);
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

async function gununSozuGetir() {
  const collections = [Sentence, Hadis, Dua, Ayet];
  const randomModel = collections[Math.floor(Math.random() * collections.length)];
  const count = await randomModel.countDocuments();
  if (count === 0) return null;
  const random = Math.floor(Math.random() * count);
  const doc = await randomModel.findOne().skip(random);
  return doc ? doc.sentence : null;
}

async function runJobsSequentially() {
  const gruplar = [
    { isim: 'Çatı Özel Ders(Çarşamba)', anketVeriCek: true, hatirlatma: false, anketGonder: false, gununSozuMesaji: false },
    { isim: 'Uhuvvet Eşliğinde Mütalaa', anketVeriCek: false, hatirlatma: false, anketGonder: false, gununSozuMesaji: false },
    { isim: 'Yazılım', anketVeriCek: false, hatirlatma: false, anketGonder: false, gununSozuMesaji: false }
  ];

  try {
    // 1. Tüm grupların anket verilerini çek
    console.log('Anket verileri çekiliyor...');
    for (const grup of gruplar) {
      if (grup.anketVeriCek) {
        try {
          await anketVeriCek(grup.isim);
        } catch (error) {
          console.error(`${grup.isim} grubu için anket verisi çekilirken hata oluştu:`, error.message);
        }
      }
    }

    // 2. Hatırlatma mesajını oluştur ve gönder
    let hatirlatmaMesaji;
    for (const grup of gruplar) {
      if (grup.hatirlatma) {
        if (!hatirlatmaMesaji) {
          hatirlatmaMesaji = await hatirlatmaMesajiOlustur();
          console.log('Hatırlatma mesajı hazırlanıyor...');
        }
        try {
          await hatirlatmaMesajiGonder(grup.isim, hatirlatmaMesaji);
        } catch (error) {
          console.error(`${grup.isim} grubu için hatırlatma mesajı gönderilirken hata oluştu:`, error.message);
        }
      }
    }

    // 3. Anketleri gönder
    console.log('Anketler gönderiliyor...');
    for (const grup of gruplar) {
      if (grup.anketGonder) {
        try {
          await anketGonder(grup.isim);
        } catch (error) {
          console.error(`${grup.isim} grubu için anket gönderilirken hata oluştu:`, error.message);
        }
      }
    }

    // 4. Günün sözü mesajını gönder
    let gununSozu;
    for (const grup of gruplar) {
      if (grup.gununSozuMesaji) {
        if (!gununSozu) {
          gununSozu = await gununSozuGetir();
          if (!gununSozu) {
            console.log('Günün sözü bulunamadı.');
            break;
          }
          console.log('Günün sözü gönderiliyor...');
        }
        try {
          await hatirlatmaMesajiGonder(grup.isim, gununSozu);
          console.log(`${grup.isim} grubuna günün sözü gönderildi.`);
        } catch (error) {
          console.error(`${grup.isim} grubuna günün sözü gönderilemedi:`, error.message);
        }
      }
    }

    console.log('Tüm işlemler tamamlandı.');
  } catch (error) {
    console.error('İşlemler sırasında beklenmeyen bir hata oluştu:', error.message);
  } finally {
    // MongoDB bağlantısını kapat
    await mongoose.disconnect();
  }
}

// Uygulama başlatıldığında işlemleri başlat
runJobsSequentially();
