// clang++ -O2 -Wl,-z,relro,-z,now skatequest.cpp -o skatequest

#include <cstdlib>
#include <cstddef>
#include <cstring>
#include <iostream>
#include <sstream>
#include <string>
#include <vector>

class Player;

static std::string readLine(const char* prompt) {
    std::cout << prompt;
    std::string line;
    if (!std::getline(std::cin, line)) {
        std::cout << "\nFarewell.\n";
        std::exit(0);
    }
    return line;
}

static void readLineInto(const char* prompt, std::string& line) {
    std::cout << prompt;
    if (!std::getline(std::cin, line)) {
        std::cout << "\nFarewell.\n";
        std::exit(0);
    }
}


static int readChoice(const char* prompt, int lo, int hi) {
    while (true) {
        std::istringstream in(readLine(prompt));
        int value;
        if ((in >> value) && value >= lo && value <= hi)
            return value;
        std::cout << "Please enter a number between " << lo << " and " << hi << ".\n";
    }
}


static bool readYesNo(const char* prompt) {
    while (true) {
        std::string line = readLine(prompt);
        if (line == "y" || line == "Y" || line == "yes") return true;
        if (line == "n" || line == "N" || line == "no")  return false;
        std::cout << "Please answer y or n.\n";
    }
}

class Item {
public:
    std::string name;
    int price;
    int durability;

    Item(const std::string& n, int p)
        : name(n), price(p), durability(100) {}
    virtual ~Item() {}

    virtual std::string describe() const = 0;

    virtual bool use(Player& p) = 0;

    virtual int attackBonus() const { return 0; }
};

class Toy : public Item {
public:
    int power;

    Toy(const std::string& n, int price, int pw) : Item(n, price), power(pw) {}

    std::string describe() const {
        std::ostringstream out;
        out << name << " (+" << power << " dmg)";
        return out.str();
    }

    bool use(Player& p);
    int  attackBonus() const { return power; }
};

class Kibble : public Item {
public:
    int healing;

    Kibble(const std::string& n, int price, int h) : Item(n, price), healing(h) {}

    std::string describe() const {
        std::ostringstream out;
        out << name << " (heals " << healing << ")";
        return out.str();
    }

    bool use(Player& p);
};

class SprayCan : public Item {
public:
    SprayCan(const std::string& n, int price) : Item(n, price) {}

    std::string describe() const {
        return name + " (reusable)";
    }

    bool use(Player& p);
};

class BadGuy {
public:
    virtual ~BadGuy() {}

    std::string name;
    int  hp, maxHp, attack;
    int  goldReward, xpReward;
    bool isBoss;

    BadGuy()
        : hp(0), maxHp(0), attack(0), goldReward(0), xpReward(0) {}

    BadGuy(const std::string& n, int h, int a, int gold, int xp)
        : name(n), hp(h), maxHp(h), attack(a),
          goldReward(gold), xpReward(xp) {}

    bool alive() const { return hp > 0; }
    void makeBoss() { isBoss = true; }

    bool enraged(bool isBoss) const {
        return isBoss && hp * 2 <= maxHp;
    }

    int strike(bool isBoss) const {
        return enraged(isBoss) ? attack * 2 : attack;
    }
};


static const size_t kInventorySlots = 8;


static char* copyName(const std::string& text) {
    char* buf = new char[text.size() + 1];
    std::memcpy(buf, text.c_str(), text.size() + 1);
    return buf;
}

class Player {
public:
    char* name;
    int hp, maxHp, xp, gold;

    Item* inventory[kInventorySlots];
    Item* equipped;

    Player() : name(copyName("Ollie")), hp(30), maxHp(30), xp(0), gold(40), inventory(), equipped(NULL) {}

    size_t inventorySize() const {
        size_t n = 0;
        while (n < kInventorySlots && inventory[n] != NULL)
            ++n;
        return n;
    }

    ~Player() {
        for (size_t i = 0; i < inventorySize(); ++i)
            delete inventory[i];
        delete[] name;
    }

    void rename(const std::string& text) {
        char* old = name;
        name = copyName(text);
        delete[] old;
    }

    int  level()  const { return 1 + xp / 20; }
    int  damage() const { return level() + (equipped ? equipped->attackBonus() : 0); }
    bool alive()  const { return hp > 0; }
    bool full()   const { return inventorySize() >= kInventorySlots; }

    bool addItem(Item* it) {
        if (full())
            return false;
        inventory[inventorySize()] = it;
        return true;
    }

    void removeItem(size_t i) {
        Item* it = inventory[i];
        if (equipped == it)
            equipped = NULL;
        for (; i + 1 < kInventorySlots; ++i)
            inventory[i] = inventory[i + 1];
        inventory[kInventorySlots - 1] = NULL;
        delete it;
    }

    void useItem(size_t i) {
        if (inventory[i]->use(*this))
            removeItem(i);
    }

    void heal(int amount) {
        hp += amount;
        if (hp > maxHp)
            hp = maxHp;
    }

    void gainRewards(int goldReward, int xpReward) {
        gold += goldReward;
        int before = level();
        xp += xpReward;
        int after = level();
        for (int lv = before; lv < after; ++lv) {
            maxHp += 8;
            hp    += 8;
        }
        if (after > before)
            std::cout << "You reach level " << after << "!  (max HP " << maxHp << ")\n";
    }
};

bool Toy::use(Player& p) {
    if (p.equipped == this)
        std::cout << "You are already wielding the " << name << ".\n";
    else
        std::cout << "You ready the " << name << ".\n";
    p.equipped = this;
    return false;
}

bool Kibble::use(Player& p) {
    int before = p.hp;
    p.heal(healing);
    std::cout << "You eat the " << name << " and recover " << (p.hp - before) << " HP.\n";
    return true;
}

bool SprayCan::use(Player& p) {
    size_t count = p.inventorySize();
    if (count == 0)
        return false;

    std::cout << "Choose an item to repaint:\n";
    for (size_t i = 0; i < count; ++i) {
        Item* item = p.inventory[i];
        size_t shown = item->name.size() < 64 ? item->name.size() : 64;
        std::cout << "  " << (i + 1) << ") ";
        std::cout.write(item->name.data(), shown);
        std::cout << "\n";
    }

    int selected = readChoice("Which item? >", 1, (int)count);
    Item* target = p.inventory[(size_t)(selected - 1)];

    readLineInto("New label: ", target->name);
    std::cout << "The fresh paint dries immediately.\n";
    return false;
}

enum ItemKind { KIND_TOY, KIND_KIBBLE, KIND_SPRAY_CAN };

struct StockEntry {
    const char* name;
    ItemKind    kind;
    int         value;
    int         price;
};

static const StockEntry kStock[] = {
    { "Biscuit", KIND_KIBBLE, 15,  12 },
    { "Steak", KIND_KIBBLE, 40,  35 },
    { "Tennis Ball", KIND_TOY,  6,  25 },
    { "Rubber Duck", KIND_TOY, 10,  60 },
    { "Deflated Soccer Ball", KIND_TOY, 15, 120 },
    { "Sharpened Bone", KIND_TOY, 21, 220 },
    { "Spray Can", KIND_SPRAY_CAN, 0, 10000 },
};
static const int kStockCount = sizeof(kStock) / sizeof(kStock[0]);

static Item* makeItem(const StockEntry& e) {
    if (e.kind == KIND_TOY)
        return new Toy(e.name, e.price, e.value);
    if (e.kind == KIND_KIBBLE)
        return new Kibble(e.name, e.price, e.value);
    return new SprayCan(e.name, e.price);
}

struct BadGuyEntry {
    const char* name;
    int  hp, attack, gold, xp;
    bool isBoss;
};

static const BadGuyEntry kBestiary[] = {
    { "go-karting dingo", 14,  2,  20,  4 },
    { "surboarding mudkip", 21,  3,  25,  6 },
    { "snowboarding mixue", 28,  4,  30, 10 },
    { "roller-blading emu", 42,  4,  80, 20 },
    { "pogoing rat", 40,  5,  45, 12 },
    { "skiing salmon", 54,  6,  55, 14 },
    { "hang-gliding ferret", 70,  7,  65, 16 },
    { "surfing eagle", 104,  8, 150, 30 },
    { "scooting quokka", 84,  9,  80, 20 },
    { "wakeboarding grasshopper", 98, 10,  90, 22 },
    { "ice-skating giraffe", 112, 11, 100, 26 },
    { "keyboarding cat", 168, 12, 250, 50 },
};
static const int kBestiaryCount = sizeof(kBestiary) / sizeof(kBestiary[0]);


static const int kLedgerSlots = 3;

class Game {
public:
    BadGuy* ledger[kLedgerSlots];
    BadGuy* ordinarySlain;
    int ledgerEntries;

    Player player;
    std::vector<BadGuy*> monsters;
    int bossesRequired;
    int round;

    Game()
        : ledger(), ordinarySlain(NULL), ledgerEntries(0),
          bossesRequired(1), round(0) {}

    ~Game() {
        for (size_t i = 0; i < monsters.size(); ++i)
            delete monsters[i];
    }

    void run();

private:
    void banner();
    void nameHero();
    void chooseDifficulty();
    void spawnBaddies();
    void camp();
    void visitShop();
    void openInventory();
    void fight(BadGuy* m);
    void showScore();
    int  bossesSlain() const;
    void victory();
    void defeat();
};

void Game::banner() {
    std::cout << "\n"
                 "  ==================================\n"
                 "           SKATEBOARD QUEST\n"
                 "  ==================================\n\n";
}


void Game::nameHero() {
    while (true) {
        std::string text = readLine("What is your name, adventurer? ");
        player.rename(text.empty() ? std::string("Ollie") : text);

        std::cout << "Keep the name \"" << player.name << "\"? ";
        if (readYesNo("(y/n) "))
            break;
    }
    std::cout << "Very well, " << player.name << ".\n\n";
}


void Game::chooseDifficulty() {
    std::cout << "Choose your trial:\n"
                 "  1) Ollie   - defeat 1 boss\n"
                 "  2) Shuvit  - defeat 2 bosses\n"
                 "  3) Kickflip   - defeat all 3 bosses\n";
    bossesRequired = readChoice("> ", 1, 3);
}


void Game::spawnBaddies() {
    for (int i = 0; i < kBestiaryCount; ++i) {
        const BadGuyEntry& e = kBestiary[i];
        BadGuy* m = new BadGuy(e.name, e.hp, e.attack, e.gold, e.xp);

        if ((i-1)%4 == 0) m->makeBoss();

        monsters.push_back(m);
    }
}


void Game::showScore() {
    for (int i = 0; i < kLedgerSlots; ++i)
        ledger[i] = NULL;
    ordinarySlain = NULL;

    size_t ledgerCount = 0;
    for (size_t i = 0; i < monsters.size(); ++i) {
        BadGuy* monster = monsters[i];
        if (monster->hp > 0)
            continue;

        if (ledgerCount == kLedgerSlots)
            break;

        (monster->isBoss
             ? ledger[ledgerCount++]
             : ordinarySlain) = monster;

    }

    ledgerEntries = 0;
    int total = 0;
    for (int i = 0; i < kLedgerSlots; ++i) {
        if (ledger[i] != NULL) {
            ++ledgerEntries;
            total += ledger[i]->goldReward + ledger[i]->xpReward;
        }
    }

    std::cout << "\n--- Score ---\n";
    if (ledgerEntries == 0) {
        std::cout << "You have slain nothing worth recording.\nScore: 0\n";
        return;
    }

    std::cout << "You have slain ";
    int shown = 0;
    for (int i = 0; i < kLedgerSlots; ++i) {
        if (ledger[i] == NULL)
            continue;
        if (shown)
            std::cout << (shown + 1 == ledgerEntries ? " and " : ", ");
        std::cout << ledger[i]->name;
        ++shown;
    }
    std::cout << ".\nScore: " << total * bossesRequired << "\n";

    if (ordinarySlain != NULL)
        std::cout << "Last ordinary foe: " << ordinarySlain->name << "\n";
}

int Game::bossesSlain() const {
    int n = 0;
    for (size_t i = 0; i < monsters.size(); ++i)
        if (kBestiary[i].isBoss && monsters[i]->hp <= 0)
            ++n;
    return n;
}

void Game::camp() {
    while (true) {
        BadGuy* next = monsters[round];
        const bool isBoss = kBestiary[round].isBoss;

        std::cout << "\n=== Camp - Round " << (round + 1) << "/" << monsters.size() << " ===\n"
                  << player.name << "   HP " << player.hp << "/" << player.maxHp
                  << "   Lv " << player.level()
                  << "   XP " << player.xp
                  << "   Gold " << player.gold << "\n"
                  << "Wielding: "
                  << (player.equipped ? player.equipped->describe() : std::string("nothing")) << "\n"
                  << "Bosses slain: " << bossesSlain() << " of " << bossesRequired << "\n"
                  << "Next foe: " << next->name
                  << "   HP " << next->hp
                  << "   ATK " << next->attack
                  << (isBoss ? "   [BOSS]" : "") << "\n\n"
                  << "  1) Inventory\n"
                     "  2) Shop\n"
                     "  3) Score\n"
                     "  4) Advance\n";

        int choice = readChoice("> ", 1, 4);
        if (choice == 1)
            openInventory();
        else if (choice == 2)
            visitShop();
        else if (choice == 3)
            showScore();
        else if (choice == 4)
            return;
    }
}

void Game::openInventory() {
    while (true) {
        std::cout << "\n--- Inventory (" << player.inventorySize()
                  << "/" << kInventorySlots << ") ---\n"
                     "  1) Show items\n"
                     "  2) Use an item\n"
                     "  3) Sell an item\n"
                     "  4) Back\n";

        int choice = readChoice("> ", 1, 4);
        if (choice == 4)
            return;
        if (player.inventorySize() == 0) {
            std::cout << "You are carrying nothing.\n";
            continue;
        }

        if (choice == 1) {
            for (size_t i = 0; i < player.inventorySize(); ++i) {
                Item* it = player.inventory[i];
                std::cout << "  " << (i + 1) << ") " << it->describe()
                          << (it == player.equipped ? "   [equipped]" : "") << "\n";
            }
            continue;
        }

        int n = readChoice("Which item? >", 1, (int)player.inventorySize());
        size_t i = (size_t)(n - 1);

        if (choice == 2) {
            player.useItem(i);
        } else {
            int refund = player.inventory[i]->price / 2;
            std::cout << "You sell the item in slot " << n
                      << " for " << refund << " gold.\n";
            player.gold += refund;
            player.removeItem(i);
        }
    }
}

void Game::visitShop() {
    while (true) {
        size_t free = kInventorySlots - player.inventorySize();
        std::cout << "\n--- Shop ---   " << player.gold << " gold, "
                  << free << (free == 1 ? " free slot\n" : " free slots\n");
        for (int i = 0; i < kStockCount; ++i) {
            const StockEntry& e = kStock[i];
            std::cout << "  " << (i + 1) << ") " << e.name;
            if (e.kind == KIND_TOY)
                std::cout << " (+" << e.value << " dmg)";
            else if (e.kind == KIND_KIBBLE)
                std::cout << " (heals " << e.value << ")";
            else
                std::cout << " (reusable)";
            std::cout << "   " << e.price << " gold\n";
        }
        std::cout << "  " << (kStockCount + 1) << ") Back\n";

        int choice = readChoice("> ", 1, kStockCount + 1);
        if (choice == kStockCount + 1)
            return;

        const StockEntry& e = kStock[choice - 1];
        if (player.full()) {
            std::cout << "Your pack is full.\n";
            continue;
        }
        if (player.gold < e.price) {
            std::cout << "You cannot afford that.\n";
            continue;
        }
        player.gold -= e.price;
        player.addItem(makeItem(e));
        std::cout << "You buy the " << e.name << ".\n";
    }
}

void Game::fight(BadGuy* m) {
    const bool isBoss = monsters[round]->isBoss;
    std::cout << "\n--- " << m->name << (isBoss ? "  [BOSS]" : "") << " ---\n";

    while (m->alive() && player.alive()) {
        std::cout << "\n" << m->name << "  HP " << m->hp << "/" << m->maxHp
                  << (m->enraged(isBoss) ? "  (enraged!)" : "")
                  << "      " << player.name << "  HP " << player.hp << "/" << player.maxHp << "\n"
                  << "  1) Attack\n"
                     "  2) Use an item\n"
                     "  3) Score\n";

        int choice = readChoice("> ", 1, 3);

        if (choice == 3) {
            showScore();
            continue;  
        } else if (choice == 1) {
            int dmg = player.damage();
            m->hp -= dmg;
            std::cout << "You hit " << m->name << " for " << dmg << ".\n";
        } else if (player.inventorySize() == 0) {
            std::cout << "You are carrying nothing.\n";
            continue;
        } else {
            for (size_t i = 0; i < player.inventorySize(); ++i)
                std::cout << "  " << (i + 1) << ") " << player.inventory[i]->describe() << "\n";
            int n = readChoice("Which item? ", 1, (int)player.inventorySize());
            player.useItem((size_t)(n - 1));
        }

        if (!m->alive())
            break;

        int hit = m->strike(isBoss);
        player.hp -= hit;
        std::cout << m->name << " hits you for " << hit << ".\n";
    }

    if (!player.alive())
        return;

    std::cout << "\n" << m->name << " falls!\n";
    if (isBoss)
        std::cout << "A boss lies dead - " << bossesSlain() << " of " << bossesRequired << ".\n";
    std::cout << "You gain " << m->goldReward << " gold and " << m->xpReward << " XP.\n";
    player.gainRewards(m->goldReward, m->xpReward);
}

void Game::victory() {
    std::cout << "\n==================================\n"
              << "  " << player.name << " stands victorious.\n"
              << "  Bosses slain: " << bossesSlain() << "\n"
              << "  Level " << player.level() << ", " << player.gold << " gold to their name.\n"
              << "==================================\n";
}

void Game::defeat() {
    std::cout << "\n----------------------------------\n"
              << "  " << player.name << " has fallen.\n"
              << "  Bosses slain: " << bossesSlain() << " of " << bossesRequired << "\n"
              << "----------------------------------\n";
}

void Game::run() {
    banner();
    nameHero();
    chooseDifficulty();
    spawnBaddies();

    player.addItem(new Toy("Frayed Rope", 0, 3));
    player.useItem(0);

    while (true) {
        if (bossesSlain() >= bossesRequired) { victory(); return; }
        if (!player.alive())                 { defeat();  return; }
        if (round >= (int)monsters.size())   { defeat();  return; }

        camp();
        fight(monsters[round]);
        ++round;
    }
}


Game g;

int main() {
    std::cout << std::unitbuf;
    g.run();
    return 0;
}
