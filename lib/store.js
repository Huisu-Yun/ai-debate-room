// 아주 단순한 파일 기반 저장소. 방(room) 데이터를 메모리에 두고,
// 바뀔 때마다 data/rooms.json 에 저장해서 서버가 재시작돼도 데이터가 남도록 합니다.
// 친구/가족 규모의 소규모 사용을 가정한 단순 구현입니다 (별도 DB 불필요).

const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, '..', 'data');
const DATA_FILE = path.join(DATA_DIR, 'rooms.json');

if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

let rooms = new Map();

function load() {
  try {
    if (fs.existsSync(DATA_FILE)) {
      const raw = fs.readFileSync(DATA_FILE, 'utf-8');
      const obj = JSON.parse(raw);
      rooms = new Map(Object.entries(obj));
    }
  } catch (err) {
    console.error('저장된 방 데이터를 불러오는 중 오류:', err.message);
    rooms = new Map();
  }
}

let saveQueued = false;
function save() {
  // 저장 호출이 짧은 시간에 여러 번 몰려도 한 번만 디스크에 쓰도록 살짝 미룹니다.
  if (saveQueued) return;
  saveQueued = true;
  setTimeout(() => {
    saveQueued = false;
    try {
      const obj = Object.fromEntries(rooms);
      fs.writeFileSync(DATA_FILE, JSON.stringify(obj, null, 2));
    } catch (err) {
      console.error('방 데이터를 저장하는 중 오류:', err.message);
    }
  }, 250);
}

load();

module.exports = {
  getRoom(id) {
    return rooms.get(id) || null;
  },
  setRoom(id, room) {
    rooms.set(id, room);
    save();
  },
  allRooms() {
    return Array.from(rooms.values());
  },
};
