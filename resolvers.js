
const { PubSub } = require('graphql-subscriptions')
const pubsub = new PubSub()
const { GraphQLError } = require('graphql')
const jwt = require("jsonwebtoken");
const Author = require("./models/Author");
const Book = require("./models/Book");
const User = require("./models/User");


const resolvers = {
    Query: {
      bookCount: async () => Book.collection.countDocuments(),
  
      booksInGenre: async (root, args) => {
        if(args.genres) {
          const books = await Book.find({ genres: { $in: args.genres } }).populate("author"); 
          return books;
        }
      },
  
      allBooks: async (root, args) => {
        console.log("root in allbooks in index.js backend: ", root);
        console.log("args in allbooks in index.js backend: ", args);
        if (args.author) {
          const author = await Author.findOne({ name: args.author });
          if (author) {
            return Book.find({ author: author.id }).populate("author");
          }
        }
        if (args.genres) {
          return Book.find({ genres: { $in: args.genres } }).populate("author");
        }
        return Book.find({}).populate("author");
      },
  
      authorCount: async () => {
        const count = await Author.collection.countDocuments();
        return count;
      },
  
      allAuthors: async () => {
        const authors = await Author.find({});
        return Promise.all(authors.map(async author => {
          const bookCount = await Book.countDocuments({ author: author.id });
          return {
            ...author.toObject(),
            bookCount,
            id: author.id.toString(),
          };
        }));
      },
  
      me: (root, args, context) => {
        return context.currentUser;
      },
    },
  
    Mutation: {
      createUser: async (root, args) => {
        const user = new User({
          username: args.username,
          favoriteGenre: args.favoriteGenre,
        });
        try {
          await user.save();
          return user;
        } catch (error) {
          throw new GraphQLError("User validation failed", {
            extensions: {
              code: "BAD_USER_INPUT",
              invalidArgs: args,
              validationErrors: error.errors,
            },
          });
        }
      },
      login: async (root, args) => {
        const user = await User.findOne({ username: args.username });
        if (!user || args.password !== "secret") {
          throw new GraphQLError("Wrong credentials", {
            extensions: {
              code: "UNAUTHENTICATED",
            },
          });
        }
        const userForToken = {
          username: user.username,
          id: user._id,
        };
        return { value: jwt.sign(userForToken, process.env.JWT_SECRET) };
      },
  
      addAuthor: async (root, args, context) => {
        if (args.name.length < 3) {
          throw new GraphQLError(
            "Author name must be at least 3 characters long",
            {
              extensions: {
                code: "BAD_USER_INPUT",
                invalidArgs: args,
              },
            }
          );
        }
  
        const author = new Author({ ...args });
        const currentUser = context.currentUser;
        if (!currentUser) {
          throw new GraphQLError("Not authenticated", {
            extensions: {
              code: "UNAUTHENTICATED",
            },
          });
        }
        try {
          await author.save();
          return author;
        } catch (error) {
          if (error.name === "ValidationError") {
            throw new GraphQLError("Author validation failed", {
              extensions: {
                code: "BAD_USER_INPUT",
                invalidArgs: args,
                validationErrors: error.errors,
              },
            });
          } else {
            throw new GraphQLError("Author failed to save", {
              extensions: {
                code: "INTERNAL_SERVER_ERROR",
                error: error.message,
              },
            });
          }
        }
      },
  
      addBook: async (root, args, context) => {
        if (args.title.length < 3) {
          throw new GraphQLError(
            "Book title must be at least 2 characters long",
            {
              extensions: {
                code: "BAD_USER_INPUT",
                invalidArgs: args,
              },
            }
          );
        }
        let author = await Author.findOne({ name: args.author });
        const currentUser = context.currentUser;
        if (!currentUser) {
          throw new GraphQLError("Not authenticated", {
            extensions: {
              code: "UNAUTHENTICATED",
            },
          });
        }
        if (!author) {
          author = new Author({ name: args.author });
          try {
            await author.save();
          } catch (error) {
            if (error.name === "ValidationError") {
              throw new GraphQLError("Author validation failed", {
                extensions: {
                  code: "BAD_USER_INPUT",
                  invalidArgs: args,
                  validationErrors: error.errors,
                },
              });
            } else {
              throw new GraphQLError("Author failed to save", {
                extensions: {
                  code: "INTERNAL_SERVER_ERROR",
                  error: error.message,
                },
              });
            }
          }
        }
  
        try {
          const book = new Book({ ...args, author: author.id });
          const currentUser = context.currentUser;
          if (!currentUser) {
            throw new GraphQLError("Not authenticated", {
              extensions: {
                code: "UNAUTHENTICATED",
              },
            });
          }
          await book.save();
          const populatedBook = await Book.findById(book.id).populate('author');

          pubsub.publish('BOOK_ADDED', { bookAdded: populatedBook })
  
          return populatedBook;
        } catch (error) {
          if (error.name === "ValidationError") {
            throw new GraphQLError("Book validation failed", {
              extensions: {
                code: "BAD_USER_INPUT",
                invalidArgs: args,
                validationErrors: error.errors,
              },
            });
          } else {
            throw new GraphQLError("Book failed to save", {
              extensions: {
                code: "INTERNAL_SERVER_ERROR",
                error: error.message,
              },
            });
            
          }

          
        }
     
      },
  
      editAuthor: async (root, args) => {
        const author = await Author.findOne({ name: args.name });
  
        if (!author) {
          return null;
        }
  
        try {
          author.born = args.setBornTo;
          await author.save();
          return author;
        } catch (error) {
          if (error.name === "ValidationError") {
            throw new GraphQLError("Author validation failed", {
              extensions: {
                code: "BAD_USER_INPUT",
                invalidArgs: args,
                validationErrors: error.errors,
              },
            });
          } else {
            throw new GraphQLError("Saving author failed", {
              extensions: {
                code: "INTERNAL_SERVER_ERROR",
                error: error.message,
              },
            });
          }
        }
      },
    },

    Subscription: {
        bookAdded: {
          subscribe: () => pubsub.asyncIterator('BOOK_ADDED')
        },
      },
    
  };

    module.exports = resolvers;

