#include "babyheap.h"
#include <ctype.h>
#include <errno.h>
#include <limits.h>
#include <stdbool.h>
#include <stdio.h>
#include <stdlib.h>

#define MAX_NOTES 16
#define NOTE_TITLE_LEN 32
#define MAX_NOTE_TEXT_LEN 1024

typedef struct Note note_t;

struct Note {
  char *title;
  char *text;
  note_t *next;
};

note_t *note_store_head;

int note_count = 0;

typedef enum { READ_OK, READ_INVALID, READ_TRUNCATED, READ_EOF } read_status_t;

void init(void) {
  setvbuf(stdout, NULL, _IONBF, 0);
  setvbuf(stdin, NULL, _IONBF, 0);
  setvbuf(stderr, NULL, _IONBF, 0);
}

note_t *get_note(int idx) {
  note_t *note = note_store_head;

  for (int i = 0; i < idx && note; i++)
    note = note->next;

  return note;
}
read_status_t read_string(char *buf, size_t max) {
  size_t n = 0;
  size_t discarded = 0;
  int c;
  int last = 0;

  while ((c = getchar()) != '\n' && c != EOF) {
    last = c;
    if (n < max) {
      buf[n++] = (char)c;
    } else {
      discarded++;
    }
  }

  if (c == '\n' && last == '\r') {
    if (discarded > 0)
      discarded--;
    else if (n > 0)
      n--;
  }

  buf[n] = '\0';

  if (c == EOF && n == 0 && discarded == 0)
    return READ_EOF;

  return discarded > 0 ? READ_TRUNCATED : READ_OK;
}

read_status_t read_number(long *value) {
  char input[32];
  char *start;
  char *end;
  read_status_t status = read_string(input, sizeof input - 1);

  if (status == READ_EOF)
    return READ_EOF;
  if (status == READ_TRUNCATED)
    return READ_INVALID;

  start = input;
  while (isspace((unsigned char)*start))
    start++;

  if (*start == '\0')
    return READ_INVALID;

  errno = 0;
  *value = strtol(start, &end, 10);
  if (errno == ERANGE || end == start)
    return READ_INVALID;

  while (isspace((unsigned char)*end))
    end++;

  return *end == '\0' ? READ_OK : READ_INVALID;
}

read_status_t read_choice(int *choice) {
  long value;
  read_status_t status = read_number(&value);

  if (status != READ_OK)
    return status;
  if (value < INT_MIN || value > INT_MAX)
    return READ_INVALID;

  *choice = (int)value;
  return READ_OK;
}

read_status_t read_note_index(const char *prompt, int *idx) {
  read_status_t status;

  printf("%s", prompt);
  status = read_choice(idx);
  if (status == READ_EOF)
    return READ_EOF;
  if (status != READ_OK || *idx < 0 || *idx >= note_count) {
    puts("Invalid note index.");
    return READ_INVALID;
  }

  return READ_OK;
}

bool create_note(void) {
  if (note_count >= MAX_NOTES) {
    puts("Maximum number of notes reached.");
    return true;
  }

  note_t *note = malloc(sizeof *note);
  char *title = malloc(NOTE_TITLE_LEN + 1);

  if (!note || !title)
    exit(EXIT_FAILURE);

  printf("Note title: ");
  read_status_t status = read_string(title, NOTE_TITLE_LEN);
  if (status == READ_EOF) {
    free(title);
    free(note);
    return false;
  }
  if (status == READ_TRUNCATED)
    printf("Title truncated to %d characters.\n", NOTE_TITLE_LEN);

  printf("Note length: ");
  long requested_len;
  status = read_number(&requested_len);
  if (status == READ_EOF) {
    free(title);
    free(note);
    return false;
  }

  if (status != READ_OK || requested_len < 0 ||
      requested_len > MAX_NOTE_TEXT_LEN) {
    free(title);
    free(note);
    printf("Invalid length. Enter a value from 0 to %d.\n", MAX_NOTE_TEXT_LEN);
    return true;
  }

  size_t len = (size_t)requested_len;
  char *text = malloc(len + 1);
  if (!text)
    exit(EXIT_FAILURE);

  printf("Note text: ");
  status = read_string(text, len);
  if (status == READ_EOF) {
    free(text);
    free(title);
    free(note);
    return false;
  }
  if (status == READ_TRUNCATED)
    printf("Text truncated to %zu characters.\n", len);

  note->title = title;
  note->text = text;

  int idx = note_count;
  if (!note_store_head) {
    note_store_head = note;
  } else {
    note_t *tail = note_store_head;
    while (tail->next)
      tail = tail->next;
    tail->next = note;
  }
  note_count++;
  printf("Note %d created.\n", idx);
  return true;
}

bool show_note(void) {
  int idx;
  read_status_t status = read_note_index("Note to display: ", &idx);
  if (status == READ_EOF)
    return false;
  if (status != READ_OK)
    return true;

  note_t *n = get_note(idx);
  if (!n) {
    puts("Invalid note.");
    return true;
  }

  printf("================================\n");
  printf("TITLE: %s\n", n->title);
  printf("================================\n");
  printf("%s\n", n->text);

  return true;
}

bool delete_note(void) {
  int idx;
  read_status_t status = read_note_index("Note to delete: ", &idx);
  if (status == READ_EOF)
    return false;
  if (status != READ_OK)
    return true;

  note_t *n = get_note(idx);

  if (!n) {
    puts("Invalid note.");
    return true;
  }

  if (n == note_store_head) {
    note_store_head = note_store_head->next;
  } else {
    note_t *prev = get_note(idx-1);
    prev->next = n->next;
  }

  note_count--;
  free(n->title);
  free(n->text);
  free(n);
  printf("Note %d deleted.\n", idx);
  return true;
}


void menu(void) {
  puts("1. New note");
  puts("2. Show note");
  puts("3. Delete note");
  puts("4. Exit");
  printf("> ");
}

int main(void) {
  init();
  int choice;
  while (1) {
    menu();
    read_status_t status = read_choice(&choice);
    if (status == READ_EOF) {
      puts("\nGoodbye.");
      return 0;
    }
    if (status != READ_OK) {
      puts("Invalid choice.");
      continue;
    }

    switch (choice) {
    case 1:
      if (!create_note()) {
        return 0;
      }
      break;
    case 2:
      if (!show_note()) {
        return 0;
      }
      break;
    case 3:
      if (!delete_note()) {
        return 0;
      }
      break;
    case 4:
      puts("Goodbye.");
      return 0;
    default:
      puts("Invalid choice.");
      break;
    }
  }
}
